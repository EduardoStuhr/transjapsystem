const toNumber = (value, fallback = 0) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const derivarQuantidade = (itemFilho = {}, itemPai = {}, services = []) => {
  if (!itemFilho?.derivadoDe || itemFilho.derivadoDe !== itemPai?.id) return toNumber(itemFilho.quantity, 0);

  const servicoPai = services.find((service) => service.id === itemPai.serviceId);
  const espessura = toNumber(servicoPai?.espessuraCamadaPadrao, 0);
  if (espessura <= 0) return toNumber(itemFilho.quantity, 0);

  return toNumber(itemPai.quantity, toNumber(itemPai.volumeInSitu, 0)) * espessura;
};

export const recalcularItensDerivados = (items = [], services = []) => {
  let atualizou = false;

  const novosItems = items.map((item) => {
    if (!item.derivadoDe) return item;

    const itemPai = items.find((candidate) => candidate.id === item.derivadoDe);
    if (!itemPai) return item;

    const novaQuantidade = derivarQuantidade(item, itemPai, services);
    if (Math.abs(novaQuantidade - toNumber(item.quantity, 0)) <= 0.01) return item;

    atualizou = true;
    return {
      ...item,
      quantity: novaQuantidade,
      volumeInSitu: novaQuantidade,
    };
  });

  return atualizou ? novosItems : items;
};
