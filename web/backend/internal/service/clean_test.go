package service

import "testing"

func TestParseNum(t *testing.T) {
	cases := []struct {
		in       string
		want     *float64
		censored bool
	}{
		{"", nil, false},
		{"  ", nil, false},
		{"abc", nil, false},
		{"5.5 g", fp(5.5), false},
		{"1,200", fp(1200), false},
		{"<5", fp(2.5), true},
	}
	for _, c := range cases {
		got, cen := parseNum(c.in)
		if (got == nil) != (c.want == nil) || (got != nil && *got != *c.want) || cen != c.censored {
			t.Errorf("parseNum(%q) = %v,%v want %v,%v", c.in, got, cen, c.want, c.censored)
		}
	}
}

func fp(x float64) *float64 { return &x }

func TestCleanRow(t *testing.T) {
	idx := HeaderIndex([]string{"Company", "Item", "Calories", "Sodium\n(mg)", "Protein (g)"})
	p := CleanRow([]string{"KFC", "Wings", "300", "<5", "12"}, idx, 2)
	if p.IsSectionRow || !p.Censored || p.Calories == nil || *p.Calories != 300 || *p.Sodium != 2.5 {
		t.Errorf("fila normal mal limpiada: %+v", p)
	}
	s := CleanRow([]string{"Taco Bell", "Salad Dressings", "", "", ""}, idx, 3)
	if !s.IsSectionRow {
		t.Errorf("fila sin numéricos debe ser de sección")
	}
}
