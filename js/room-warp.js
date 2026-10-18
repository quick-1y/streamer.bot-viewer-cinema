/* Shared geometry for the precomputed artwork correction, masks and rug sampling. */
(function () {
  'use strict';
  const VC = window.VC;
  const mesh = VC.RoomMesh;
  function coefficients(source, target) {
    const [s, p, q] = source, [t, u, v] = target;
    const px=p[0]-s[0], py=p[1]-s[1], qx=q[0]-s[0], qy=q[1]-s[1];
    const ux=u[0]-t[0], uy=u[1]-t[1], vx=v[0]-t[0], vy=v[1]-t[1];
    const det=px*qy-py*qx;
    const a=(ux*qy-vx*py)/det, c=(vx*px-ux*qx)/det;
    const b=(uy*qy-vy*py)/det, d=(vy*px-uy*qx)/det;
    return [a,b,c,d,t[0]-a*s[0]-c*s[1],t[1]-b*s[0]-d*s[1]];
  }
  const triangles = mesh.triangles.map(ids => {
    const source=ids.map(i=>mesh.source[i]), target=ids.map(i=>mesh.target[i]);
    return {source,target,matrix:coefficients(source,target)};
  });
  function map(x,y) {
    for (const t of triangles) {
      const [a,b,c]=t.source;
      const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const u=((b[0]-x)*(c[1]-y)-(b[1]-y)*(c[0]-x))/area;
      const v=((c[0]-x)*(a[1]-y)-(c[1]-y)*(a[0]-x))/area;
      if (u < -1e-7 || v < -1e-7 || u+v > 1+1e-7) continue;
      const [m,n,p,q,r,s]=t.matrix;
      return [m*x+p*y+r,n*x+q*y+s];
    }
    return [x,y];
  }
  function polygon(points) {
    return points.flatMap((a,i)=>{
      const b=points[(i+1)%points.length], n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8);
      return Array.from({length:n},(_,j)=>map(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n));
    });
  }
  function triangle(ctx, image, source, target, bleed=0) {
    const center=target.reduce((a,b)=>[a[0]+b[0]/3,a[1]+b[1]/3],[0,0]);
    ctx.save();
    ctx.beginPath();
    target.forEach((p,i)=>{
      // A small subpixel overlap prevents antialiasing cracks between cached faces.
      const d=Math.hypot(p[0]-center[0],p[1]-center[1]);
      const x=p[0]+(p[0]-center[0])*bleed/d, y=p[1]+(p[1]-center[1])*bleed/d;
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    });
    ctx.closePath(); ctx.clip();
    ctx.transform(...coefficients(source,target));
    ctx.drawImage(image,0,0);
    ctx.restore();
  }
  VC.RoomWarp={map,polygon,triangle};
})();
