export const TOOL_PREFS_KEY='toolkit-tools-v1';
export function normalizeTools(value, ids){
 const order=[...new Set([...(Array.isArray(value?.order)?value.order:[]).filter(id=>ids.includes(id)),...ids])];
 const hidden=[...new Set((Array.isArray(value?.hidden)?value.hidden:[]).filter(id=>ids.includes(id)))];
 if(hidden.length===ids.length)hidden.splice(hidden.indexOf(order[0]),1);
 return {order,hidden};
}
