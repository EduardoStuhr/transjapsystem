const toPositiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const migratePrazoMeta = (meta = {}) => {
  const source = meta?.meta ? { ...meta.meta, ...meta } : meta;
  const initial = { ...source };

  if (initial.totalHorasProjeto && !initial.prazoMeses) {
    const total = toPositiveNumber(initial.totalHorasProjeto);
    const horasDia = 9;
    const diasUteisMes = 22;
    const prazoMeses = Math.round(total / (horasDia * diasUteisMes));

    if (prazoMeses > 0) {
      initial.prazoMeses = prazoMeses;
      initial.diasUteisMes = diasUteisMes;
      initial.horasDia = horasDia;
    }
  }

  return initial;
};

export const buildPrazoParams = (params = {}, meta = {}) => {
  const prazoMeta = migratePrazoMeta(meta);

  return {
    ...params,
    prazo_meses: prazoMeta.prazoMeses || params?.prazo_meses,
    dias_uteis_mes: prazoMeta.diasUteisMes || params?.dias_uteis_mes,
    horas_dia: prazoMeta.horasDia || params?.horas_dia,
  };
};

export const calcTotalHorasProjeto = (meta = {}) => {
  const prazoMeta = migratePrazoMeta(meta);
  return (
    toPositiveNumber(prazoMeta.prazoMeses) *
    toPositiveNumber(prazoMeta.diasUteisMes) *
    toPositiveNumber(prazoMeta.horasDia)
  );
};
