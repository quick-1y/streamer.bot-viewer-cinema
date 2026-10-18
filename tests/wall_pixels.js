/* Pixel regression for the illustrated walls. Survey guides only bound the search;
 * contrast edges in the rendered canvas determine the measured angle.
 * Theil–Sen initialization and trimmed least squares reject curtains and highlights.
 */
({canvas, guides, target = true, specs = [
        {name:'screen-upper-edge', sign:1},
        {name:'screen-lower-edge', sign:-1},
        {name:'cinema-sign-beam', sign:-1},
        {name:'entrance-beam-upper', sign:-1}
    ]}) => {
    // Search around the survey guides, but measure the angle from actual pixels.
    const {width,height} = canvas;
    const pixels = canvas.getContext('2d').getImageData(0,0,width,height).data;
    const median = values => {
        const s=values.slice().sort((a,b)=>a-b),m=s.length>>1;
        return s.length%2?s[m]:(s[m-1]+s[m])/2;
    };
    const luminance=(x,y)=>{
        const i=(y*width+x)*4;
        return .2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
    };
    const fit=points=>{
        const slopes=[];
        for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)
            if(points[j].x-points[i].x>20)
                slopes.push((points[j].y-points[i].y)/(points[j].x-points[i].x));
        if(!slopes.length)return {angle:null,points:points.length,inliers:0};
        let slope=median(slopes),intercept=median(points.map(p=>p.y-slope*p.x)),keep=[];
        for(let n=0;n<3;n++){
            keep=points.filter(p=>Math.abs(p.y-slope*p.x-intercept)<2.5);
            if(keep.length<3)return {angle:null,points:points.length,inliers:keep.length};
            const meanX=keep.reduce((s,p)=>s+p.x,0)/keep.length;
            const meanY=keep.reduce((s,p)=>s+p.y,0)/keep.length;
            slope=keep.reduce((s,p)=>s+(p.x-meanX)*(p.y-meanY),0)/keep.reduce((s,p)=>s+(p.x-meanX)**2,0);
            intercept=meanY-slope*meanX;
        }
        return {angle:Math.atan(slope)*180/Math.PI,points:points.length,inliers:keep.length,
            residual:median(keep.map(p=>Math.abs(p.y-slope*p.x-intercept)))};
    };
    return specs.map(spec=>{
        const guide=guides.find(g=>g.name===spec.name);
        if(!guide)throw new Error('Missing wall survey: '+spec.name);
        const line=guide[target?'target':'source'];
        const [a,b]=line,slope=(b[1]-a[1])/(b[0]-a[0]),intercept=a[1]-slope*a[0];
        const points=[];
        for(let x=Math.ceil(a[0]);x<=Math.floor(b[0]);x+=2){
            const guess=Math.round(slope*x+intercept);
            let best=-Infinity,bestY=guess;
            for(let y=Math.max(3,guess-14);y<=Math.min(height-4,guess+14);y++){
                const score=spec.sign*(luminance(x,y+2)-luminance(x,y-2));
                if(score>best){best=score;bestY=y;}
            }
            if(best>=24)points.push({x,y:bestY});
        }
        return {name:spec.name,...fit(points)};
    });
}
