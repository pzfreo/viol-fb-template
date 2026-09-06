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
exports both named underside stencil templates together as SVG or 3MF.
Enter the fingerboard taper, lengths and thickness at frets 1 and 7 to generate
both fret templates together. The 3MF contains two separate parts, each 1.5 mm
thick by default, ready to open in a slicer.

Review F1 and F7 in separate tabs, adjust the shared corner rounding, and
optionally download each section outline before generating the templates.

Run `npm run dev --prefix site` and open http://127.0.0.1:5173/.
