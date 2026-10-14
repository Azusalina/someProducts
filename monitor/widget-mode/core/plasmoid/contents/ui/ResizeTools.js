.pragma library
function heights(saved) { try { return JSON.parse(saved || "{}") } catch(e) { return {} } }
function weights(saved) { try { const w=JSON.parse(saved||"[1,1,1]");return w.length===3 ? w : [1,1,1] } catch(e) { return [1,1,1] } }
function columns(modules,count) {
    let next=0
    return modules.map(key => {
        if (["media","note","terminal","radios","battery","timers","powertimers"].includes(key)) { next=0;return -1 }
        const result=next;next=(next+1)%count;return result
    })
}
function widths(total,count,saved) {
    const w=weights(saved),pool=Math.max(100*count,total-10*(count-1)),free=pool-100*count,sum=w.slice(0,count).reduce((a,b)=>a+b,0)
    return w.slice(0,count).map(value=>100+free*value/sum)
}
function split(total,count,saved,index,delta) {
    const sizes=widths(total,count,saved),w=weights(saved)
    if(index<0 || index>=count-1) return saved||"[1,1,1]"
    const shift=Math.max(100-sizes[index],Math.min(sizes[index+1]-100,delta))
    const pair=w[index]+w[index+1],left=Math.max(0.001,sizes[index]+shift-100),right=Math.max(0.001,sizes[index+1]-shift-100)
    w[index]=pair*left/(left+right);w[index+1]=pair*right/(left+right)
    return JSON.stringify(w)
}
function fraction(saved,key,fallback) { const data=heights(saved);return data[key] === undefined ? fallback : data[key] }
function saveSplit(preferences,key,value) {
    const data=heights(preferences.layoutSplits)
    data[key]=Math.max(0.15,Math.min(0.85,value))
    preferences.layoutSplits=JSON.stringify(data)
}
function rectangle(g,edge,delta,availableWidth,availableHeight) {
    const width=Math.max(200,Math.min(availableWidth,g.width+(edge==="left"?-delta:edge==="right"?delta:0)))
    const height=Math.max(120,Math.min(availableHeight,g.height+(edge==="top"?-delta:edge==="bottom"?delta:0)))
    const x=Math.max(0,Math.min(availableWidth-width,edge==="left"?g.x+g.width-width:g.x))
    const y=Math.max(0,Math.min(availableHeight-height,edge==="top"?g.y+g.height-height:g.y))
    return {x:x,y:y,width:width,height:height}
}
function host(applet) {
    let item=applet.parent
    while(item && !(item.applet===applet && item.layout)) item=item.parent
    return item || null
}
function resizeHost(applet,edge,delta) {
    const item=host(applet)
    if(!item) return false
    const layout=item.layout
    const next=rectangle(item,edge,delta,layout.width,layout.height)
    layout.releaseSpace(item)
    item.width=next.width;item.height=next.height;item.x=next.x;item.y=next.y
    layout.positionItem(item)
    layout.save()
    return true
}
