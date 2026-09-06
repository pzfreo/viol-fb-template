# viol-fb-template
Viol fb template

[Open Fingerboard Studio](https://pzfreo.github.io/viol-fb-template/)

Viol fingerboard cross-section references:

- [meares1](meares1.png)
- [meares2](meares2.png)

[Tracing and curve analysis](analysis/README.md) includes normalized outlines,
side-blend comparisons, spline data and a reproducible analysis script.

[Fingerboard Studio](site/README.md) is a client-side web app with width, fixed
playing-surface radius, maximum thickness and corner-drop controls. It
exports both named underside stencil templates together as one full-size SVG.
Enter the fingerboard taper, lengths and thickness at frets 1 and 7 to generate
both fret templates together in one SVG.

Run `npm run dev --prefix site` and open http://127.0.0.1:5173/.
