// Long-sentence part splitting — ported EXACTLY from the user's reference
// reader (splitS in his index.html). Long sentences are read in parts:
// each gesture moves one part, the current part stays bright while the
// others sit in trail colour.
export function splitS(s: string): string[] {
  if (s.length <= 130) return [s];
  const n = s.length;
  const k = Math.ceil(n / 120);
  const cand: number[] = [];
  const re = /[,;:—–)](?=\s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) cand.push(m.index + 1);
  const cuts: number[] = [];
  for (let j = 1; j < k; j++) {
    const ideal = Math.round((n * j) / k);
    const last = cuts.length ? cuts[cuts.length - 1] : 0;
    let best = -1;
    let bd = Infinity;
    for (const c of cand) {
      const d = Math.abs(c - ideal);
      if (c > last + 25 && c < n - 25 && d < bd && d < (n / k) * 0.45) {
        best = c;
        bd = d;
      }
    }
    if (best < 0) {
      for (let d = 0; d < (n / k) * 0.5; d++) {
        const a = ideal + d;
        const b = ideal - d;
        if (s[a] === " " && a > last + 25 && a < n - 25) {
          best = a;
          break;
        }
        if (s[b] === " " && b > last + 25 && b < n - 25) {
          best = b;
          break;
        }
      }
    }
    if (best > 0) cuts.push(best);
  }
  const out: string[] = [];
  let a = 0;
  cuts.forEach((c) => {
    out.push(s.slice(a, c));
    a = c;
  });
  out.push(s.slice(a));
  return out.filter((x) => x.trim());
}
