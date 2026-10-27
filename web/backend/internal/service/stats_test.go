package service

import (
	"math"
	"testing"
)

func TestDescribe(t *testing.T) {
	d := Describe([]float64{5, 1, 3, 2, 4})
	if d.N != 5 || d.Mean != 3 || d.P50 != 3 || d.P25 != 2 || d.P75 != 4 || d.Min != 1 || d.Max != 5 {
		t.Errorf("Describe = %+v", d)
	}
	if math.Abs(d.SD-math.Sqrt(2.5)) > 1e-9 {
		t.Errorf("SD = %v", d.SD)
	}
	if (Describe(nil) != Desc{}) {
		t.Error("vacío debe dar Desc cero")
	}
}
