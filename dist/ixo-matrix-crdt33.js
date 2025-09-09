const r = () => /* @__PURE__ */ new Map(), c = (t, n, s) => {
  let e = t.get(n);
  return e === void 0 && t.set(n, e = s()), e;
}, f = (t, n) => {
  const s = [];
  for (const [e, o] of t)
    s.push(n(o, e));
  return s;
};
export {
  r as create,
  f as map,
  c as setIfUndefined
};
