package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// MCP is how an assistant reaches this app: one endpoint that lists the tools
// it may call and then runs them. Everything here is read-only on purpose. A
// model that misunderstands a sentence can only tell you something you already
// own, never write it down wrong or throw it away, so the whole surface can be
// judged on whether the answers are useful rather than on what it might break.
//
// Credentials are absent by design and not by omission. They are the one thing
// in HQ whose whole value is that it never leaves the box.
//
// The transport is JSON-RPC 2.0 over a single POST, which is as much of MCP's
// HTTP transport as a read-only server needs. Nothing here is a long-running
// job and nothing is pushed the other way, so there is no SSE channel.

// The spec version these messages follow. Clients announce their own during
// initialize; every one worth supporting accepts being answered with ours.
const mcpProtocol = "2025-06-18"

type rpcRequest struct {
	ID     json.RawMessage `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	if s.cfg.MCPToken == "" {
		fail(w, http.StatusNotFound, "mcp nggak aktif")
		return
	}
	// Constant time: this is a bearer token on an endpoint anyone can reach.
	if subtle.ConstantTimeCompare([]byte(bearer(r)), []byte(s.cfg.MCPToken)) != 1 {
		fail(w, http.StatusUnauthorized, "token salah")
		return
	}

	// Not readJSON: a JSON-RPC envelope carries fields this server has no
	// opinion about, and refusing unknown ones would refuse every real client.
	var in rpcRequest
	defer r.Body.Close()
	if err := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(&in); err != nil {
		writeJSON(w, http.StatusOK, rpcResponse{
			JSONRPC: "2.0",
			Error:   &rpcError{Code: -32700, Message: "parse error"},
		})
		return
	}

	// No id means a notification, which by definition wants no answer.
	// "initialized" is the only one a client sends here.
	if len(in.ID) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}

	result, rerr := s.mcpDispatch(r.Context(), in)
	writeJSON(w, http.StatusOK, rpcResponse{
		JSONRPC: "2.0",
		ID:      in.ID,
		Result:  result,
		Error:   rerr,
	})
}

func (s *Server) mcpDispatch(ctx context.Context, in rpcRequest) (any, *rpcError) {
	switch in.Method {
	case "initialize":
		return map[string]any{
			"protocolVersion": mcpProtocol,
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "hq", "version": "1"},
		}, nil

	case "ping":
		return map[string]any{}, nil

	case "tools/list":
		return map[string]any{"tools": mcpToolList()}, nil

	// Clients ask for these even after initialize says we have neither. An
	// empty list is a cheaper answer than an error they have to special-case.
	case "resources/list":
		return map[string]any{"resources": []any{}}, nil
	case "prompts/list":
		return map[string]any{"prompts": []any{}}, nil

	case "tools/call":
		var p struct {
			Name      string  `json:"name"`
			Arguments mcpArgs `json:"arguments"`
		}
		if err := json.Unmarshal(in.Params, &p); err != nil {
			return nil, &rpcError{Code: -32602, Message: "invalid params"}
		}
		for _, tool := range mcpTools {
			if tool.Name != p.Name {
				continue
			}
			out, err := tool.Run(ctx, s, p.Arguments)
			if err != nil {
				// Handed back as a failed result rather than a protocol
				// error, so the model can read it and try something else.
				// The reason stays in the log, like everywhere else here.
				s.log.Error("mcp tool failed", "tool", tool.Name, "err", err)
				return mcpFailure("gagal jalanin " + tool.Name), nil
			}
			return mcpResult(out), nil
		}
		return nil, &rpcError{Code: -32602, Message: "unknown tool: " + p.Name}
	}

	return nil, &rpcError{Code: -32601, Message: "method not found: " + in.Method}
}

// mcpResult wraps a tool's return value the way MCP expects it. JSON as text
// is what every client renders and what the model reads best.
func mcpResult(v any) map[string]any {
	body, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return mcpFailure("hasilnya nggak kebaca")
	}
	return map[string]any{
		"content": []any{map[string]any{"type": "text", "text": string(body)}},
	}
}

func mcpFailure(message string) map[string]any {
	return map[string]any{
		"isError": true,
		"content": []any{map[string]any{"type": "text", "text": message}},
	}
}

type mcpTool struct {
	Name     string
	Desc     string
	Props    map[string]any
	Required []string
	Run      func(ctx context.Context, s *Server, a mcpArgs) (any, error)
}

func mcpToolList() []map[string]any {
	out := make([]map[string]any, 0, len(mcpTools))
	for _, t := range mcpTools {
		props := t.Props
		if props == nil {
			props = map[string]any{}
		}
		schema := map[string]any{"type": "object", "properties": props}
		if len(t.Required) > 0 {
			schema["required"] = t.Required
		}
		out = append(out, map[string]any{
			"name":        t.Name,
			"description": t.Desc,
			"inputSchema": schema,
		})
	}
	return out
}

// mcpArgs is whatever the model decided to send. Nothing in it is trusted to
// be present or to be the right type, which is why every read has a fallback
// rather than an error: a missing filter should widen the search, not fail it.
type mcpArgs map[string]any

func (a mcpArgs) str(key string) string {
	v, _ := a[key].(string)
	return strings.TrimSpace(v)
}

// JSON numbers arrive as float64 no matter how the schema described them.
func (a mcpArgs) num(key string, fallback int) int {
	if v, ok := a[key].(float64); ok {
		return int(v)
	}
	return fallback
}

func (a mcpArgs) flag(key string) bool {
	v, _ := a[key].(bool)
	return v
}

// date reads a yyyy-mm-dd argument, falling back to a number of days from
// today when it is missing or unreadable.
func (a mcpArgs) date(key string, fallbackDays int) time.Time {
	if t, err := time.Parse("2006-01-02", a.str(key)); err == nil {
		return t
	}
	return time.Now().AddDate(0, 0, fallbackDays)
}

func text(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc}
}

func number(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}

func boolean(desc string) map[string]any {
	return map[string]any{"type": "boolean", "description": desc}
}

// The catalogue. Descriptions are the only documentation the model gets, so
// they say when to reach for a tool rather than restating its name.
var mcpTools = []mcpTool{
	{
		Name: "hq_search",
		Desc: "Search everything in HQ at once: projects, links, people, clients, " +
			"documents, belongings, assets, expenses, income, supplies and tags. " +
			"Start here whenever it is not obvious which list a thing lives in. " +
			"Every word has to appear in a row, so extra words narrow the result.",
		Props: map[string]any{
			"query": text("What to look for."),
			"limit": number("How many hits to return. Default 40, maximum 100."),
		},
		Required: []string{"query"},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.Search(ctx, a.str("query"), a.num("limit", 0))
		},
	},
	{
		Name: "hq_overview",
		Desc: "The home page in one call: how many of each thing exist, project " +
			"status counts, what falls due in the next 30 days, recently touched " +
			"projects, supplies running low, monitors in trouble, and monthly " +
			"income and expense totals per currency.",
		Run: func(ctx context.Context, s *Server, _ mcpArgs) (any, error) {
			return s.store.Overview(ctx)
		},
	},
	{
		Name: "hq_calendar",
		Desc: "Every dated thing between two dates: birthdays, day milestones, " +
			"document expiries, asset renewals, rent, maintenance, and income and " +
			"expense due dates. Use this for questions about a specific stretch of " +
			"time; use hq_due_soon for what is coming up next.",
		Props: map[string]any{
			"from": text("First day, yyyy-mm-dd. Defaults to today."),
			"to":   text("Last day, yyyy-mm-dd. Defaults to 30 days from today."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.Calendar(ctx, a.date("from", 0), a.date("to", 30))
		},
	},
	{
		Name: "hq_due_soon",
		Desc: "What falls due within the next few days, already sorted by how soon. " +
			"This is the same list the morning notification is built from.",
		Props: map[string]any{
			"days": number("How far ahead to look. Default 14."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.DueWithin(ctx, a.num("days", 14))
		},
	},
	{
		Name: "hq_people",
		Desc: "The address book: name, nickname, role, birthday, when they were " +
			"last talked to, and which client they belong to if any.",
		Props: map[string]any{
			"query": text("Filter by name, nickname, role, email or phone."),
			"scope": text("'personal' for people with no client, 'client' for the ones attached to a client. Omit for everyone."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListPeople(ctx, store.PersonFilter{
				Query: a.str("query"),
				Scope: a.str("scope"),
			})
		},
	},
	{
		Name: "hq_person",
		Desc: "One person in full, by id. Use hq_people or hq_search first to find the id.",
		Props: map[string]any{
			"id": number("The person's id."),
		},
		Required: []string{"id"},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.PersonByID(ctx, int64(a.num("id", 0)))
		},
	},
	{
		Name: "hq_projects",
		Desc: "Projects, with their client, status, kind, repository and deploy target.",
		Props: map[string]any{
			"query":  text("Filter by name, summary or notes."),
			"status": text("Project status."),
			"kind":   text("Project kind."),
			"client": text("Client slug, not the client's name."),
			"tag":    text("Tag slug."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListProjects(ctx, store.ProjectFilter{
				Query:  a.str("query"),
				Status: a.str("status"),
				Kind:   a.str("kind"),
				Client: a.str("client"),
				Tag:    a.str("tag"),
			})
		},
	},
	{
		Name: "hq_expenses",
		Desc: "Recurring and one-off expenses: amount, currency, cycle, status, " +
			"next due date, and what they are attached to.",
		Props: map[string]any{
			"query":    text("Filter by name or notes."),
			"status":   text("Expense status."),
			"category": text("Expense category."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListExpenses(ctx, store.ExpenseFilter{
				Query:    a.str("query"),
				Status:   a.str("status"),
				Category: a.str("category"),
			})
		},
	},
	{
		Name: "hq_income",
		Desc: "Income streams: amount, currency, cycle, status, next due date, and " +
			"the client or project behind them.",
		Props: map[string]any{
			"query":   text("Filter by name or notes."),
			"status":  text("Income status."),
			"client":  text("Client slug."),
			"project": text("Project slug."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListIncome(ctx, store.IncomeFilter{
				Query:   a.str("query"),
				Status:  a.str("status"),
				Client:  a.str("client"),
				Project: a.str("project"),
			})
		},
	},
	{
		Name: "hq_documents",
		Desc: "Identity and legal documents: kind, holder, issuer, when they were " +
			"issued and when they expire. The document numbers themselves are " +
			"encrypted and are never returned here.",
		Props: map[string]any{
			"query":  text("Filter by name, issuer, location or notes."),
			"kind":   text("Document kind."),
			"holder": text("Whose document it is."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListDocuments(ctx, store.DocumentFilter{
				Query:  a.str("query"),
				Kind:   a.str("kind"),
				Holder: a.str("holder"),
			})
		},
	},
	{
		Name: "hq_belongings",
		Desc: "Physical things owned or rented: brand, model, year, where it is, " +
			"condition, warranty, rent and when maintenance is next due.",
		Props: map[string]any{
			"query":  text("Filter by name, brand, model, identifier or location."),
			"kind":   text("Belonging kind."),
			"status": text("Belonging status."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListBelongings(ctx, store.BelongingFilter{
				Query:  a.str("query"),
				Kind:   a.str("kind"),
				Status: a.str("status"),
			})
		},
	},
	{
		Name: "hq_supplies",
		Desc: "Household stock: how much is left, the level it counts as low at, " +
			"and when it was last restocked. Set low_only for the shopping list.",
		Props: map[string]any{
			"query":    text("Filter by name, location or notes."),
			"category": text("Supply category."),
			"low_only": boolean("Only what has run low enough to need buying."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListSupplies(ctx, store.SupplyFilter{
				Query:    a.str("query"),
				Category: a.str("category"),
				LowOnly:  a.flag("low_only"),
			})
		},
	},
	{
		Name: "hq_assets",
		Desc: "Subscriptions, domains, servers and other things that renew: " +
			"provider, identifier, cost, status and renewal date.",
		Props: map[string]any{
			"query":   text("Filter by name, provider or identifier."),
			"kind":    text("Asset kind."),
			"status":  text("Asset status."),
			"project": text("Project slug the asset is attached to."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListAssets(ctx, store.AssetFilter{
				Query:   a.str("query"),
				Kind:    a.str("kind"),
				Status:  a.str("status"),
				Project: a.str("project"),
			})
		},
	},
	{
		Name: "hq_clients",
		Desc: "Clients and companies, with their kind and status.",
		Props: map[string]any{
			"query":  text("Filter by name, company or notes."),
			"status": text("Client status."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.store.ListClients(ctx, store.ClientFilter{
				Query:  a.str("query"),
				Status: a.str("status"),
			})
		},
	},
	{
		Name: "hq_notice_log",
		Desc: "Which notifications HQ has already sent, newest first: what each " +
			"one was about, the day it fell due, and the morning it went out. A " +
			"row of kind 'digest' is the daily roundup rather than one deadline. " +
			"Use this to answer what you were told and when.",
		Props: map[string]any{
			"days": number("How far back to look. Default 30, maximum 400."),
		},
		Run: func(ctx context.Context, s *Server, a mcpArgs) (any, error) {
			return s.noticeLog(ctx, a.num("days", 30))
		},
	},
	{
		Name: "hq_monitor",
		Desc: "Every health check reported in by an outside machine, with its " +
			"current state and when it last checked in. Use this to answer " +
			"whether anything is down.",
		Run: func(ctx context.Context, s *Server, _ mcpArgs) (any, error) {
			return s.store.Checks(ctx)
		},
	},
}
