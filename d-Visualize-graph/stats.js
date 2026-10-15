/* Probability models; no random sampling, network, or external numerical library. */
(function(root){
  'use strict';
  const aliases={poisson:'poisson',poissondist:'poisson',binomial:'binomial',binom:'binomial',binomialdist:'binomial',n:'normal',normal:'normal',normaldist:'normal',uniform:'uniform',uniformdist:'uniform',exponential:'exponential',exponentialdist:'exponential',expon:'exponential'};
  const canonical=name=>Object.hasOwn(aliases,name.toLowerCase())?aliases[name.toLowerCase()]:undefined;
  const factorials=[0];
  function logFactorial(n){
    if(n<128){while(factorials.length<=n){const k=factorials.length;factorials.push(factorials[k-1]+Math.log(k));}return factorials[n];}
    const z=1/n,z2=z*z;
    return (n+.5)*Math.log(n)-n+.5*Math.log(2*Math.PI)+z*(1/12-z2*(1/360-z2*(1/1260-z2/1680)));
  }
  function erf(x){
    const sign=Math.sign(x),a=Math.abs(x),t=1/(1+.3275911*a);
    return sign*(1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t)*Math.exp(-a*a));
  }
  const clamp=p=>Math.max(0,Math.min(1,p));
  function tail(start,term,next,limit){
    if(term===0)return 0;let sum=term;
    for(let k=start,i=0;i<20000&&k<limit;i++){term=next(term,k);k++;if(!Number.isFinite(term))return NaN;sum+=term;if(term<=sum*1e-14)return sum;}
    return Number.isFinite(limit)?sum:NaN;
  }
  function create(name,args){
    name=canonical(name);if(!name)throw Error('未知概率分布');
    if(!args.every(Number.isFinite))throw Error('分布参数必须为有限实数');
    const d={isDistribution:true,family:name,discrete:['poisson','binomial'].includes(name),params:args.slice()};
    if(name==='poisson'){
      if(args.length!==1||args[0]<0||args[0]>1e6)throw Error('Poisson: 0 ≤ λ ≤ 10⁶');
      const lambda=args[0],mode=Math.floor(lambda);
      d.support=[0,Infinity];d.domain=[Math.max(-.5,lambda-6*Math.sqrt(lambda)-2),Math.max(3,lambda+6*Math.sqrt(lambda)+2)];d.mode=mode;
      d.pmf=k=>!Number.isInteger(k)||k<0?0:lambda===0?(k===0?1:0):Math.exp(-lambda+k*Math.log(lambda)-logFactorial(k));
      d.cdf=x=>{
        if(Number.isNaN(x))return NaN;if(x<0)return 0;if(x===Infinity||lambda===0)return 1;
        const k=Math.floor(x);if(k<mode){let p=d.pmf(k),sum=p;for(let j=k;j>0;j--){p*=j/lambda;sum+=p;if(p<=sum*1e-14)break;}return clamp(sum);}
        return clamp(1-tail(k+1,d.pmf(k+1),(p,j)=>p*lambda/(j+1),Infinity));
      };
    }else if(name==='binomial'){
      if(args.length!==2||!Number.isInteger(args[0])||args[0]<0||args[0]>1e6||args[1]<0||args[1]>1)throw Error('Binomial: n 为 0…10⁶ 的整数，0 ≤ p ≤ 1');
      const [n,p]=args,mode=Math.floor((n+1)*p);d.support=[0,n];const spread=6*Math.sqrt(n*p*(1-p))+2;d.domain=[Math.max(-.5,n*p-spread),Math.min(Math.max(.5,n+.5),n*p+spread)];d.mode=Math.min(n,mode);
      d.pmf=k=>!Number.isInteger(k)||k<0||k>n?0:p===0?(k===0?1:0):p===1?(k===n?1:0):Math.exp(logFactorial(n)-logFactorial(k)-logFactorial(n-k)+k*Math.log(p)+(n-k)*Math.log1p(-p));
      d.cdf=x=>{
        if(Number.isNaN(x))return NaN;if(x<0)return 0;if(x>=n||p===0)return 1;if(p===1)return 0;const k=Math.floor(x);
        if(k<mode){let term=d.pmf(k),sum=term;for(let j=k;j>0;j--){term*=j/(n-j+1)*(1-p)/p;sum+=term;if(term<=sum*1e-14)break;}return clamp(sum);}
        return clamp(1-tail(k+1,d.pmf(k+1),(v,j)=>v*(n-j)/(j+1)*p/(1-p),n));
      };
    }else if(name==='normal'){
      if(args.length===0)args=[0,1];if(args.length!==2||args[1]<=0)throw Error('Normal: μ 为实数，方差 > 0');
      const [mu,variance]=args,sigma=Math.sqrt(variance);d.params=args;d.support=[-Infinity,Infinity];d.domain=[mu-5*sigma,mu+5*sigma];d.mode=mu;
      d.pdf=x=>Math.exp(-.5*((x-mu)/sigma)**2)/(sigma*Math.sqrt(2*Math.PI));
      d.cdf=x=>clamp(.5*(1+erf((x-mu)/(sigma*Math.SQRT2))));
    }else if(name==='uniform'){
      if(args.length===0)args=[0,1];if(args.length!==2||args[0]>=args[1])throw Error('Uniform: a < b');
      const [a,b]=args;d.params=args;d.support=[a,b];d.domain=[a-(b-a)*.15,b+(b-a)*.15];d.mode=(a+b)/2;
      d.pdf=x=>Number.isNaN(x)?NaN:x<a||x>b?0:1/(b-a);d.cdf=x=>clamp((x-a)/(b-a));
    }else{
      if(args.length===0)args=[1];if(args.length!==1||args[0]<=0)throw Error('Exponential: λ > 0');
      const rate=args[0];d.params=args;d.support=[0,Infinity];d.domain=[-.2/rate,7/rate];d.mode=0;
      d.pdf=x=>x<0?0:rate*Math.exp(-rate*x);d.cdf=x=>x<=0?0:-Math.expm1(-rate*x);
    }
    if(d.discrete)d.pdf=d.pmf;
    d.peak=d.pdf(d.mode);
    d.interval=(a,b)=>a>b?0:d.discrete?clamp(d.cdf(Math.floor(b))-d.cdf(Math.ceil(a)-1)):clamp(d.cdf(b)-d.cdf(a));
    return Object.freeze(d);
  }
  const hints={poisson:[{min:0,max:1e6}],binomial:[{min:0,max:1e6,step:1},{min:0,max:1,step:.01}],normal:[{}, {min:.001}],uniform:[{},{}],exponential:[{min:.001}]};
  function sum(fn,a,b){if(!Number.isFinite(a)||!Number.isFinite(b))return NaN;a=Math.ceil(a);b=Math.floor(b);if(a>b)return 0;if(b-a>20000)return NaN;let result=0,correction=0;for(let k=a;k<=b;k++){const value=fn(k);if(!Number.isFinite(value))return NaN;const y=value-correction,t=result+y;correction=(t-result)-y;result=t;}return result;}
  function integrateStep(fn,a,b){if(!Number.isFinite(a)||!Number.isFinite(b))return NaN;if(a>b)return -integrateStep(fn,b,a);let total=0,count=0;while(a<b){const right=Math.min(b,Math.floor(a)+1);if(right<=a||++count>20000)return NaN;const value=fn((a+right)/2);if(!Number.isFinite(value))return NaN;total+=(right-a)*value;a=right;}return total;}
  const api={canonical,create,logFactorial,erf,hints,sum,integrateStep,isDistribution:v=>!!v&&v.isDistribution===true};
  root.GraphStats=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
