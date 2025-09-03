const s = Math.floor, c = Math.abs, a = Math.log10, n = (o, t) => o < t ? o : t, e = (o, t) => o > t ? o : t, l = (o) => o !== 0 ? o < 0 : 1 / o < 0;
export {
  c as abs,
  s as floor,
  l as isNegativeZero,
  a as log10,
  e as max,
  n as min
};
