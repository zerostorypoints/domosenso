// A page not built yet: one line saying it comes next. Follows the page contract (pages/index.js).

export function render(ctx) {
  const el = document.createElement("section");
  el.className = "placeholder";
  const text = document.createElement("p");
  text.className = "placeholder-text";
  el.append(text);
  update(el, ctx);
  return el;
}

export function update(el, ctx) {
  el.querySelector(".placeholder-text").textContent = ctx.t("card.pocket.page.coming_next");
}
