/* Affine texture sampling for projected rugs and continuous character meshes. */
(function () {
  'use strict';
  const VC = window.VC;
  function coefficients(source, target) {
    const [s, p, q] = source, [t, u, v] = target;
    const px=p[0]-s[0], py=p[1]-s[1], qx=q[0]-s[0], qy=q[1]-s[1];
    const ux=u[0]-t[0], uy=u[1]-t[1], vx=v[0]-t[0], vy=v[1]-t[1];
    const det=px*qy-py*qx;
    const a=(ux*qy-vx*py)/det, c=(vx*px-ux*qx)/det;
    const b=(uy*qy-vy*py)/det, d=(vy*px-uy*qx)/det;
    return [a,b,c,d,t[0]-a*s[0]-c*s[1],t[1]-b*s[0]-d*s[1]];
  }
  function triangle(ctx, image, source, target, bleed=0, sourceRect=null) {
    // Expand by a constant distance perpendicular to each edge. Expanding
    // radially around the centroid leaves cracks on long, narrow triangles.
    const lengths=target.map((_,i)=>Math.hypot(
      target[(i+1)%3][0]-target[(i+2)%3][0], target[(i+1)%3][1]-target[(i+2)%3][1]));
    const perimeter=lengths.reduce((a,b)=>a+b,0);
    const center=target.reduce((a,p,i)=>[a[0]+p[0]*lengths[i]/perimeter,a[1]+p[1]*lengths[i]/perimeter],[0,0]);
    const [a,b,c]=target;
    const radius=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/perimeter;
    const scale=radius>1e-8 ? 1+bleed/radius : 1;
    ctx.save();
    ctx.beginPath();
    target.forEach((p,i)=>{
      const x=center[0]+(p[0]-center[0])*scale, y=center[1]+(p[1]-center[1])*scale;
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    });
    ctx.closePath(); ctx.clip();
    ctx.transform(...coefficients(source,target));
    // Mesh cells may overlap for antialiasing, but must not sample distant
    // pixels through the extended clipping polygon.
    if (sourceRect) {
      // Canvas minification filters can read well beyond a crop rectangle on
      // compressed mesh cells. The base sprite is already sampled at output
      // resolution; nearest sampling here keeps those unrelated pixels out.
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(image,...sourceRect,...sourceRect);
    } else ctx.drawImage(image,0,0);
    ctx.restore();
  }
  VC.drawTexturedTriangle = triangle;
})();
