console.log('--- Relative Date Manual Test ---');

const testCondition = (name, result) => {
  console.log(`${result ? '✅' : '❌'} ${name}`);
};

const formatLastUpdate = (lastUpdateStr) => {
  if (!lastUpdateStr) return '';
  const lastUpdate = new Date(lastUpdateStr);
  const now = new Date();
  const diffMs = now.getTime() - lastUpdate.getTime();
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths >= 1) return `Hace ${diffMonths} mes${diffMonths > 1 ? 'es' : ''}`;
  if (diffWeeks >= 1) return `Hace ${diffWeeks} semana${diffWeeks > 1 ? 's' : ''}`;
  if (diffDays >= 1) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
  return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
};

const now = new Date();
const fifteenHoursAgo = new Date(now.getTime() - (15 * 60 * 60 * 1000));
const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
const twoWeeksAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
const twoMonthsAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));

testCondition('15 hours ago', formatLastUpdate(fifteenHoursAgo.toISOString()) === 'Hace 15 horas');
testCondition('3 days ago', formatLastUpdate(threeDaysAgo.toISOString()) === 'Hace 3 días');
testCondition('2 weeks ago', formatLastUpdate(twoWeeksAgo.toISOString()) === 'Hace 2 semanas');
testCondition('2 months ago', formatLastUpdate(twoMonthsAgo.toISOString()) === 'Hace 2 meses');

console.log('Tests finished.');
