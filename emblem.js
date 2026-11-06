// Traced from the supplied Dreamcast boot reference: center to upper-right tip.
export const emblemPoints=[
 [155,115],[149,115],[144,112],[143,107],[145,102],[149,99],[155,99],
 [162,101],[166,106],[168,113],[167,120],[162,125],[154,128],
 [146,128],[139,125],[134,119],[132,111],[133,101],[137,93],
 [144,87],[152,85],[161,86],[169,90],[175,97],[179,107],
 [181,118],[180,127],[176,134],[169,139],[160,142],[149,143],
 [139,141],[130,137],[123,130],[119,121],[118,111],[120,100],
 [124,90],[130,81],[139,75],[149,71],[160,72],[171,75],
 [181,82],[188,92],[194,105]
].map(([x,y])=>[(x-157)/32,(107-y)/32]);
export const emblemSvg=()=>emblemPoints.map(([x,y],i)=>`${i?'L':'M'}${(50+x*29).toFixed(2)} ${(50-y*29).toFixed(2)}`).join(' ');
export function strokeEmblem(ctx,cx,cy,size,color){
 ctx.beginPath();emblemPoints.forEach(([x,y],i)=>i?ctx.lineTo(cx+x*size/2.75,cy-y*size/2.75):ctx.moveTo(cx+x*size/2.75,cy-y*size/2.75));
 ctx.strokeStyle=color;ctx.lineWidth=size*.072;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
}
