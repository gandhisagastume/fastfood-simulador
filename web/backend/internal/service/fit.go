package service

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

// Fit es un ajuste paramétrico y qué tan bien calza con los datos.
type Fit struct {
	Dist   string             `json:"dist"`
	Params map[string]float64 `json:"params"`
	KSD    float64            `json:"ks_d"`
	AIC    float64            `json:"aic"`
	Accept bool               `json:"accept"` // D de Kolmogorov-Smirnov <= valor crítico
}

// CurvePoint compara la distribución empírica con cada ajuste (funciones de distribución acumulada).
type CurvePoint struct {
	X           float64 `json:"x"`
	Empirical   float64 `json:"empirical"`
	Normal      float64 `json:"normal"`
	Lognormal   float64 `json:"lognormal"`
	Exponential float64 `json:"exponential"`
	Gamma       float64 `json:"gamma"`
}

type FitResult struct {
	N       int          `json:"n"`
	Zeros   int          `json:"zeros"` // valores 0 excluidos: lognormal, exponencial y gamma exigen x > 0
	DCrit   float64      `json:"d_crit"`
	Fits    []Fit        `json:"fits"`
	Best    string       `json:"best"`
	Verdict string       `json:"verdict"`
	Curve   []CurvePoint `json:"curve"`
}

var ErrFit = errors.New("datos insuficientes o sin variación para ajustar")

// gammaP es la gamma incompleta regularizada P(a, x) (Numerical Recipes: serie y fracción continua).
func gammaP(a, x float64) float64 {
	if x <= 0 {
		return 0
	}
	lg, _ := math.Lgamma(a)
	if x < a+1 {
		sum, term, ap := 1/a, 1/a, a
		for i := 0; i < 500; i++ {
			ap++
			term *= x / ap
			sum += term
			if math.Abs(term) < math.Abs(sum)*1e-13 {
				break
			}
		}
		return sum * math.Exp(-x+a*math.Log(x)-lg)
	}
	b := x + 1 - a
	c := 1 / 1e-300
	d := 1 / b
	h := d
	for i := 1; i < 500; i++ {
		an := -float64(i) * (float64(i) - a)
		b += 2
		if d = an*d + b; math.Abs(d) < 1e-300 {
			d = 1e-300
		}
		if c = b + an/c; math.Abs(c) < 1e-300 {
			c = 1e-300
		}
		d = 1 / d
		del := d * c
		h *= del
		if math.Abs(del-1) < 1e-13 {
			break
		}
	}
	return 1 - math.Exp(-x+a*math.Log(x)-lg)*h
}

func normCDF(z float64) float64 { return 0.5 * (1 + math.Erf(z/math.Sqrt2)) }

// ksD es el estadístico de Kolmogorov-Smirnov de una muestra ordenada contra una CDF.
func ksD(sorted []float64, cdf func(float64) float64) float64 {
	n := float64(len(sorted))
	d := 0.0
	for i, x := range sorted {
		f := cdf(x)
		d = math.Max(d, math.Max(math.Abs(f-float64(i+1)/n), math.Abs(f-float64(i)/n)))
	}
	return d
}

// ksTwoSample compara dos muestras: máxima distancia entre sus distribuciones acumuladas.
func ksTwoSample(a, b []float64) float64 {
	a, b = sortedCopy(a), sortedCopy(b)
	var i, j int
	d := 0.0
	for i < len(a) && j < len(b) {
		x := math.Min(a[i], b[j])
		for i < len(a) && a[i] <= x {
			i++
		}
		for j < len(b) && b[j] <= x {
			j++
		}
		d = math.Max(d, math.Abs(float64(i)/float64(len(a))-float64(j)/float64(len(b))))
	}
	return d
}

func sortedCopy(xs []float64) []float64 {
	c := append([]float64(nil), xs...)
	sort.Float64s(c)
	return c
}

// FitDistributions ajusta normal, lognormal, exponencial y gamma, y dice si alguna describe los datos.
// Estima por máxima verosimilitud (gamma con la aproximación de Minka). El valor crítico de KS
// (1.36/√n, 5%) es conservador cuando los parámetros se estiman de la misma muestra.
func FitDistributions(xs []float64) (FitResult, error) {
	var pos []float64
	for _, x := range xs {
		if x > 0 {
			pos = append(pos, x)
		}
	}
	res := FitResult{N: len(pos), Zeros: len(xs) - len(pos)}
	if len(pos) < 8 {
		return res, ErrFit
	}
	sort.Float64s(pos)
	n := float64(len(pos))
	var sum, sumLn float64
	for _, x := range pos {
		sum += x
		sumLn += math.Log(x)
	}
	mean, meanLn := sum/n, sumLn/n
	var v, vLn float64
	for _, x := range pos {
		v += (x - mean) * (x - mean)
		vLn += (math.Log(x) - meanLn) * (math.Log(x) - meanLn)
	}
	v, vLn = v/n, vLn/n
	if v == 0 || vLn == 0 {
		return res, ErrFit
	}
	sd, sdLn := math.Sqrt(v), math.Sqrt(vLn)
	s := math.Log(mean) - meanLn
	shape := (3 - s + math.Sqrt((s-3)*(s-3)+24*s)) / (12 * s)
	scale := mean / shape
	lgShape, _ := math.Lgamma(shape)

	cands := []struct {
		name   string
		params map[string]float64
		cdf    func(float64) float64
		ll     float64
		k      int
	}{
		{"Normal", map[string]float64{"media": mean, "desviación": sd},
			func(x float64) float64 { return normCDF((x - mean) / sd) },
			-n/2*math.Log(2*math.Pi*v) - n/2, 2},
		{"Lognormal", map[string]float64{"mu": meanLn, "sigma": sdLn},
			func(x float64) float64 { return normCDF((math.Log(x) - meanLn) / sdLn) },
			-sumLn - n*math.Log(sdLn) - n/2*math.Log(2*math.Pi) - n/2, 2},
		{"Exponencial", map[string]float64{"tasa": 1 / mean},
			func(x float64) float64 { return 1 - math.Exp(-x/mean) },
			-n*math.Log(mean) - n, 1},
		{"Gamma", map[string]float64{"forma": shape, "escala": scale},
			func(x float64) float64 { return gammaP(shape, x/scale) },
			(shape-1)*sumLn - sum/scale - n*shape*math.Log(scale) - n*lgShape, 2},
	}
	res.DCrit = 1.36 / math.Sqrt(n)
	for _, c := range cands {
		f := Fit{Dist: c.name, Params: c.params, KSD: ksD(pos, c.cdf), AIC: 2*float64(c.k) - 2*c.ll}
		if math.IsNaN(f.KSD) || math.IsNaN(f.AIC) || math.IsInf(f.AIC, 0) {
			continue
		}
		f.Accept = f.KSD <= res.DCrit
		res.Fits = append(res.Fits, f)
	}
	if len(res.Fits) == 0 {
		return res, ErrFit
	}
	sort.Slice(res.Fits, func(i, j int) bool { return res.Fits[i].KSD < res.Fits[j].KSD })
	best := res.Fits[0]
	res.Best = best.Dist
	if best.Accept {
		res.Verdict = fmt.Sprintf("%s describe bien los datos (D = %.3f ≤ %.3f).", best.Dist, best.KSD, res.DCrit)
	} else {
		res.Verdict = fmt.Sprintf("Ninguna distribución paramétrica ajusta (la mejor, %s, tiene D = %.3f > %.3f). El Monte Carlo usa la distribución empírica.", best.Dist, best.KSD, res.DCrit)
	}

	const points = 60
	top := pos[len(pos)-1]
	r4 := func(x float64) float64 { return math.Round(x*1e4) / 1e4 }
	for i := 1; i <= points; i++ {
		x := top * float64(i) / points
		emp := float64(sort.Search(len(pos), func(j int) bool { return pos[j] > x })) / n
		pt := CurvePoint{X: r4(x), Empirical: r4(emp)}
		for _, c := range cands {
			switch c.name {
			case "Normal":
				pt.Normal = r4(c.cdf(x))
			case "Lognormal":
				pt.Lognormal = r4(c.cdf(x))
			case "Exponencial":
				pt.Exponential = r4(c.cdf(x))
			case "Gamma":
				pt.Gamma = r4(c.cdf(x))
			}
		}
		res.Curve = append(res.Curve, pt)
	}
	return res, nil
}
