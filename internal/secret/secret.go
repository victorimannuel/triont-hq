// Package secret wraps AES-256-GCM so credential values are never written to
// the database in the clear. Ciphertext carries a version prefix so the format
// can change later without guessing what an old row holds.
package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
)

const prefix = "v1:"

var ErrFormat = errors.New("secret: unrecognised ciphertext format")

type Box struct {
	aead cipher.AEAD
}

func New(key []byte) (*Box, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

func (b *Box) Encrypt(plain string) (string, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := b.aead.Seal(nonce, nonce, []byte(plain), nil)
	return prefix + base64.StdEncoding.EncodeToString(sealed), nil
}

func (b *Box) Decrypt(token string) (string, error) {
	if token == "" {
		return "", nil
	}
	if !strings.HasPrefix(token, prefix) {
		return "", ErrFormat
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(token, prefix))
	if err != nil {
		return "", ErrFormat
	}
	n := b.aead.NonceSize()
	if len(raw) < n {
		return "", ErrFormat
	}
	plain, err := b.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// SealBytes and OpenBytes are the same construction without the base64: a file
// goes into a bytea column, where text encoding would only cost a third more
// space and buy nothing. The nonce is prepended, as above.
func (b *Box) SealBytes(plain []byte) ([]byte, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return b.aead.Seal(nonce, nonce, plain, nil), nil
}

func (b *Box) OpenBytes(sealed []byte) ([]byte, error) {
	n := b.aead.NonceSize()
	if len(sealed) < n {
		return nil, ErrFormat
	}
	plain, err := b.aead.Open(nil, sealed[:n], sealed[n:], nil)
	if err != nil {
		return nil, ErrFormat
	}
	return plain, nil
}
