package clonejson

import "encoding/json"

func Clone[T any](value T) T {
	raw, err := json.Marshal(value)
	if err != nil {
		var zero T
		return zero
	}
	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		var zero T
		return zero
	}
	return out
}

func CloneAny(value any) any {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}
