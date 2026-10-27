package service

import (
	"reflect"
	"testing"
)

func menu() []Product {
	mk := func(c string, cal, sod, prot float64) Product {
		return Product{Company: c, Item: c, Calories: &cal, Sodium: &sod, Protein: &prot}
	}
	return []Product{
		mk("KFC", 200, 500, 10), mk("KFC", 400, 900, 25),
		mk("Taco Bell", 100, 300, 5), mk("Taco Bell", 300, 700, 30),
		{Company: "KFC", Item: "Sección", IsSectionRow: true},
	}
}

func TestSimulateReproducible(t *testing.T) {
	a := Simulate(menu(), "C", "calories", 500, 42, SimFilter{}, nil)
	b := Simulate(menu(), "C", "calories", 500, 42, SimFilter{}, nil)
	c := Simulate(menu(), "C", "calories", 500, 7, SimFilter{}, nil)
	if !reflect.DeepEqual(a, b) {
		t.Error("misma semilla debe dar mismo resultado")
	}
	if reflect.DeepEqual(a, c) {
		t.Error("otra semilla debe cambiar el resultado")
	}
}

func TestSimulateShapes(t *testing.T) {
	c := Simulate(menu(), "C", "calories", 100, 1, SimFilter{}, nil)
	if len(c) != 2 || c[0].Company != "KFC" || c[1].Company != "Taco Bell" {
		t.Errorf("C debe dar una fila por cadena ordenada: %+v", c)
	}
	if b := Simulate(menu(), "B", "calories", 100, 1, SimFilter{}, nil); len(b) != 1 || b[0].Company != "BALANCED" {
		t.Errorf("B: %+v", b)
	}
	if a := Simulate(menu(), "A", "calories", 100, 1, SimFilter{}, nil); len(a) != 3 || a[0].Company != "ALL" || a[0].NValid != 100 {
		t.Errorf("A: %+v", a)
	}
	if none := Simulate(menu(), "A", "calories", 100, 1, SimFilter{Company: "Nadie"}, nil); len(none) != 0 {
		t.Errorf("sin pool debe dar vacío: %+v", none)
	}
}

func TestPresetsAndFilters(t *testing.T) {
	f, _ := Preset("E3", "sodium", SimFilter{}, nil)
	for _, r := range Simulate(menu(), "E3", "sodium", 200, 1, f, nil) {
		if r.P95 > 800 { // KFC 900 y Taco 700: solo entran <=800
			t.Errorf("E3 dejó pasar sodio > 800: %+v", r)
		}
	}
	f, over := Preset("E2", "calories", SimFilter{}, nil)
	if over == nil || *over != 600 {
		t.Error("E2 debe fijar umbral 600")
	}
	// Combo de 3 sobre valores constantes: suma exacta.
	ten := 10.0
	cte := []Product{{Company: "X", Calories: &ten}}
	r := Simulate(cte, "A", "calories", 10, 1, SimFilter{Combo: 3}, nil)
	if r[0].Mean != 30 {
		t.Errorf("combo 3 de 10 debe dar 30, dio %v", r[0].Mean)
	}
	// Preset no pisa lo que manda el cliente.
	mine := 500.0
	if f, _ := Preset("E3", "sodium", SimFilter{MaxSodium: &mine}, nil); *f.MaxSodium != 500 {
		t.Error("Preset pisó el filtro del cliente")
	}
	if r := Simulate(menu(), "A", "calories", 100, 1, SimFilter{}, &[]float64{250}[0]); r[0].POver <= 0 || r[0].POver >= 1 {
		t.Errorf("P(>250) debe estar entre 0 y 1: %v", r[0].POver)
	}
}
