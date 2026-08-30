package store

import "time"

type User struct {
	ID           int64     `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type Project struct {
	ID       int64  `json:"id"`
	Slug     string `json:"slug"`
	Name     string `json:"name"`
	ClientID *int64 `json:"client_id"`
	// Client is the resolved client name, filled from the join. It is what the
	// UI shows; ClientID is what gets written.
	Client       string    `json:"client"`
	ClientSlug   string    `json:"client_slug"`
	Status       string    `json:"status"`
	Kind         string    `json:"kind"`
	Summary      string    `json:"summary"`
	LocalPath    string    `json:"local_path"`
	DeployTarget string    `json:"deploy_target"`
	Notes        string    `json:"notes"`
	CreatedBy    string    `json:"created_by"`
	UpdatedBy    string    `json:"updated_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	LinkCount       int `json:"link_count"`
	CredentialCount int `json:"credential_count"`

	Tags        []Tag          `json:"tags"`
	Links       []Link         `json:"links,omitempty"`
	Credentials []Credential   `json:"credentials,omitempty"`
	Assets      []AssetUsage   `json:"assets,omitempty"`
	Income      []IncomeStream `json:"income,omitempty"`
}

type ProjectInput struct {
	Name         string `json:"name"`
	ClientID     *int64 `json:"client_id"`
	Status       string `json:"status"`
	Kind         string `json:"kind"`
	Summary      string `json:"summary"`
	LocalPath    string `json:"local_path"`
	DeployTarget string `json:"deploy_target"`
	Notes        string `json:"notes"`
}

type Link struct {
	ID        int64     `json:"id"`
	ProjectID int64     `json:"project_id"`
	Label     string    `json:"label"`
	URL       string    `json:"url"`
	Category  string    `json:"category"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type LinkInput struct {
	Label    string `json:"label"`
	URL      string `json:"url"`
	Category string `json:"category"`
	Notes    string `json:"notes"`
}

// Credential never carries its ciphertext into JSON. The plaintext leaves the
// server only through the dedicated reveal endpoint.
type Credential struct {
	ID          int64     `json:"id"`
	ProjectID   *int64    `json:"project_id"`
	ProjectName string    `json:"project_name"`
	ProjectSlug string    `json:"project_slug"`
	Label       string    `json:"label"`
	Kind        string    `json:"kind"`
	Username    string    `json:"username"`
	Host        string    `json:"host"`
	URL         string    `json:"url"`
	Notes       string    `json:"notes"`
	HasSecret   bool      `json:"has_secret"`
	Encrypted   string    `json:"-"`
	CreatedBy   string    `json:"created_by"`
	UpdatedBy   string    `json:"updated_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CredentialInput struct {
	ProjectID *int64 `json:"project_id"`
	Label     string `json:"label"`
	Kind      string `json:"kind"`
	Username  string `json:"username"`
	Host      string `json:"host"`
	URL       string `json:"url"`
	Notes     string `json:"notes"`
	Secret    string `json:"secret"`
}

type Client struct {
	ID        int64     `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	Kind      string    `json:"kind"`
	Company   string    `json:"company"`
	Status    string    `json:"status"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	ProjectCount int `json:"project_count"`
	ContactCount int `json:"contact_count"`

	Contacts []Contact `json:"contacts,omitempty"`
	Projects []Project `json:"projects,omitempty"`
}

type ClientInput struct {
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Company string `json:"company"`
	Status  string `json:"status"`
	Notes   string `json:"notes"`
}

type Contact struct {
	ID        int64     `json:"id"`
	ClientID  *int64    `json:"client_id"`
	Name      string    `json:"name"`
	Nickname  string    `json:"nickname"`
	Role      string    `json:"role"`
	Email     string    `json:"email"`
	Phone     string    `json:"phone"`
	IsPrimary bool      `json:"is_primary"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	Birthday        *time.Time `json:"birthday"`
	LastContactedOn *time.Time `json:"last_contacted_on"`
	ReachEveryDays  int        `json:"reach_every_days"`
}

type ContactInput struct {
	Name      string `json:"name"`
	Role      string `json:"role"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	IsPrimary bool   `json:"is_primary"`
	Notes     string `json:"notes"`
}

// Asset is a thing a project runs on or pays for: a VPS, a domain, a
// certificate, a paid account.
type Asset struct {
	ID           int64      `json:"id"`
	Name         string     `json:"name"`
	Kind         string     `json:"kind"`
	Provider     string     `json:"provider"`
	Identifier   string     `json:"identifier"`
	Status       string     `json:"status"`
	CostAmount   float64    `json:"cost_amount"`
	CostCurrency string     `json:"cost_currency"`
	BillingCycle string     `json:"billing_cycle"`
	RenewsOn     *time.Time `json:"renews_on"`
	AutoRenew    bool       `json:"auto_renew"`
	Notes        string     `json:"notes"`
	// Which login the thing is registered under. The credential is the record
	// of truth; these two are copied out for display only.
	CredentialID    *int64    `json:"credential_id"`
	CredentialLabel string    `json:"credential_label"`
	CredentialUser  string    `json:"credential_user"`
	CreatedBy       string    `json:"created_by"`
	UpdatedBy       string    `json:"updated_by"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`

	ProjectCount int          `json:"project_count"`
	Projects     []AssetUsage `json:"projects,omitempty"`
}

// AssetUsage is one side of the project/asset link, flattened for the UI.
type AssetUsage struct {
	ProjectID   int64  `json:"project_id"`
	ProjectSlug string `json:"project_slug"`
	ProjectName string `json:"project_name"`
	AssetID     int64  `json:"asset_id"`
	AssetName   string `json:"asset_name"`
	AssetKind   string `json:"asset_kind"`
	Provider    string `json:"provider"`
	Identifier  string `json:"identifier"`
	Role        string `json:"role"`
}

type AssetInput struct {
	Name         string  `json:"name"`
	Kind         string  `json:"kind"`
	Provider     string  `json:"provider"`
	Identifier   string  `json:"identifier"`
	Status       string  `json:"status"`
	CostAmount   float64 `json:"cost_amount"`
	CostCurrency string  `json:"cost_currency"`
	BillingCycle string  `json:"billing_cycle"`
	RenewsOn     string  `json:"renews_on"`
	AutoRenew    bool    `json:"auto_renew"`
	CredentialID *int64  `json:"credential_id"`
	Notes        string  `json:"notes"`
}

type AssetFilter struct {
	Kind    string
	Status  string
	Query   string
	Project string
}

type ProjectFilter struct {
	Status string
	Kind   string
	// Client is a client slug, not a name.
	Client string
	// Tag is a tag slug.
	Tag   string
	Query string
}

type ClientFilter struct {
	Status string
	Query  string
}
