# Printing doubles

An illustrated, interactive history of binary floating-point to decimal
conversion, from Coonen and Dragon to Grisu, Ryū, Schubfach, Dragonbox, and the
current frontier.

The public site is deliberately dependency-free: semantic HTML, CSS, SVG, and
JavaScript modules. Run it locally with:

```sh
npm run serve
```

Then open <http://localhost:4173>. Run the offline checks with `npm test` and
`npm run check`.

For a first reading, start with
[One number, different ways to print it](site/chapters/one-number.html).
It works through a miniature binary format before connecting each decision to
the full binary64 algorithm chapters.

Research notes and source-preservation work live outside `site/` so the public
story can stay approachable without losing technical detail or provenance.
