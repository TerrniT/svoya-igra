package gamekit

import (
	"sync"

	"svoya-igra/internal/text"
)

type Registry struct {
	mu      sync.RWMutex
	modules map[string]Module
}

func NewRegistry() *Registry {
	return &Registry{modules: map[string]Module{}}
}

func (r *Registry) Register(module Module) error {
	if module == nil || module.ID() == "" {
		return text.Error(text.BadMessage)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.modules[module.ID()] = module
	return nil
}

func (r *Registry) MustRegister(modules ...Module) {
	for _, module := range modules {
		if err := r.Register(module); err != nil {
			panic(err)
		}
	}
}

func (r *Registry) Resolve(id string) (Module, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	module, ok := r.modules[id]
	if !ok {
		return nil, text.Errorf(text.UnknownGame, id)
	}
	return module, nil
}
