package service

import (
	"math"
	"sort"
)

// Desc resumen descriptivo.
type Desc struct {
	N    int     `json:"n"`
	Mean float64 `json:"mean"`
	SD   float64 `json:"sd"`
	P25  float64 `json:"p25"`
	P50  float64 `json:"p50"`
	P75  float64 `json:"p75"`
	P95  float64 `json:"p95"`
	Min  float64 `json:"min"`
	Max  float64 `json:"max"`
}

func Describe(xs []float64) Desc {
	if len(xs) == 0 {
		return Desc{}
	}
	cp := append([]float64(nil), xs...)
	sort.Float64s(cp)
	sum := 0.0
	for _, v := range cp {
		sum += v
	}
	mean := sum / float64(len(cp))
	sd := 0.0
	if len(cp) > 1 {
		for _, v := range cp {
			sd += (v - mean) * (v - mean)
		}
		sd = math.Sqrt(sd / float64(len(cp)-1))
	}
	q := func(p float64) float64 {
		if len(cp) == 1 {
			return cp[0]
		}
		pos := p * float64(len(cp)-1)
		lo := int(math.Floor(pos))
		hi := int(math.Ceil(pos))
		if lo == hi {
			return cp[lo]
		}
		return cp[lo] + (cp[hi]-cp[lo])*(pos-float64(lo))
	}
	return Desc{N: len(cp), Mean: mean, SD: sd, P25: q(0.25), P50: q(0.5), P75: q(0.75), P95: q(0.95), Min: cp[0], Max: cp[len(cp)-1]}
}
