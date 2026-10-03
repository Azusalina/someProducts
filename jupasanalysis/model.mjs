export function codeFor(programme, year = '2027') {
  return programme.id === 'applied' && year === '2026' ? '6224' : programme.code;
}

// Constant-real-income, monthly cash-flow model from bachelor's graduation.
// Stipend is non-employment cash support; tuition is paid upfront; incremental
// living costs and stipend stop when study finishes, even at fractional years.
export function simulate(input) {
  const {months, horizon, salary, after, stipend, tuition, living, discount, fundedMonths = months} = input;
  if (![months,horizon,salary,after,stipend,tuition,living,discount,fundedMonths].every(Number.isFinite) ||
      months < 0 || months > horizon * 12 || horizon <= 0 || salary < 0 || after < 0 ||
      stipend < 0 || tuition < 0 || living < 0 || discount < 0 || discount > 30 || fundedMonths < 0 || fundedMonths > months) {
    throw new RangeError('请输入有效的非负参数；学习时间须在比较期限内。');
  }
  const totalMonths = Math.round(horizon * 12);
  const monthlyRate = (1 + discount / 100) ** (1 / 12) - 1;
  let work = 0, study = -tuition, paybackMonth = null;
  const points = [{month:0, work:0, study}];
  for (let m = 1; m <= totalMonths; m++) {
    const studyFraction = Math.max(0, Math.min(1, months - (m - 1)));
    const fundedFraction = Math.max(0, Math.min(1, Math.min(months,fundedMonths) - (m - 1)));
    const flow = fundedFraction * stipend - studyFraction * living + (1 - studyFraction) * after;
    work += salary / ((1 + monthlyRate) ** m);
    study += flow / ((1 + monthlyRate) ** m);
    if (m > months && study >= work && paybackMonth === null) paybackMonth = m;
    if (m % 12 === 0 || m === totalMonths || m === Math.ceil(months) || m === Math.ceil(fundedMonths)) points.push({month:m,work,study});
  }
  const netCost = tuition + months * (living + salary) - Math.min(months,fundedMonths) * stipend;
  return {work, study, difference:study-work, netCost, paybackMonth, points};
}
