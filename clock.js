export const launches={jp:{date:[1998,10,27],label:'JAPAN · 27 NOV 1998'},us:{date:[1999,8,9],label:'NORTH AMERICA · 09 SEP 1999'},eu:{date:[1999,9,14],label:'EUROPE · 14 OCT 1999'}};

// Calendar years plus the remainder, with midnight UTC as an explicit convention.
// This avoids DST and local-timezone differences and counts leap days correctly.
export function calculateAge(now,region='jp'){
  const [year,month,day]=(launches[region]||launches.jp).date;const start=Date.UTC(year,month,day);let years=Math.max(0,now.getUTCFullYear()-year);let anniversary=Date.UTC(year+years,month,day);
  if(+now<anniversary&&years>0){years--;anniversary=Date.UTC(year+years,month,day);}
  const delta=Math.max(0,+now-anniversary),days=Math.floor(delta/86400000),hours=Math.floor(delta/3600000)%24,minutes=Math.floor(delta/60000)%60,seconds=Math.floor(delta/1000)%60;
  const next=Date.UTC(year+years+1,month,day),total=Math.max(0,Math.floor((+now-start)/86400000));
  return{years,days,hours,minutes,seconds,total,nextBirthdayDays:Math.ceil((next-now)/86400000),isBirthday:now.getUTCMonth()===month&&now.getUTCDate()===day};
}
