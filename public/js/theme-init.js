// Mavzuni (yorug'/tungi) sahifa chizilishidan oldin qo'llash — oq "miltillash" bo'lmasligi uchun
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* xotira yopiq */ }
  var dark = saved ? saved === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}());
