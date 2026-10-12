.pragma library

function empty() { return {pending: [], urgent: []} }
function valid(data) {
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).sort().join(",") !== "pending,urgent") return false
    const ids = []
    for (const kind of ["pending", "urgent"]) {
        if (!Array.isArray(data[kind]) || data[kind].length > 100) return false
        for (const item of data[kind]) {
            if (!item || typeof item !== "object" || Object.keys(item).sort().join(",") !== "done,id,text" || typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) || ids.includes(item.id) || typeof item.text !== "string" || !item.text.trim() || Array.from(item.text).length > 300 || /[\r\n]/.test(item.text) || typeof item.done !== "boolean") return false
            ids.push(item.id)
        }
    }
    try { return encodeURIComponent(JSON.stringify(data)).replace(/%[0-9A-F]{2}|./g, "x").length <= 65536 }
    catch (e) { return false }
}
function parse(saved) {
    try { const data = JSON.parse(saved || JSON.stringify(empty())); return valid(data) ? data : empty() }
    catch (e) { return empty() }
}
function lines(data, kind) { return data[kind].map(item => item.text).join("\n") }
function edit(saved, kind, text, original) {
    const data = parse(saved)
    const old = data[kind].slice()
    if (original && original[kind]) old.push.apply(old, original[kind].filter(item => !old.some(row => row.id === item.id)))
    const next = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(value => {
        const at = old.findIndex(item => item.text === value)
        if (at >= 0) return old.splice(at, 1)[0]
        return {id: Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14), text: value, done: false}
    })
    data[kind] = next
    return valid(data) ? JSON.stringify(data) : null
}
function toggle(saved, kind, id) {
    const data = parse(saved)
    const item = data[kind].find(row => row.id === id)
    if (item) item.done = !item.done
    return JSON.stringify(data)
}
function change(saved, kind, id, text, remove) {
    const data = parse(saved)
    if (!data[kind]) return null
    if (remove) data[kind] = data[kind].filter(item => item.id !== id)
    else if (id) {
        const item = data[kind].find(row => row.id === id)
        if (!item) return null
        item.text = text.trim()
    } else data[kind].push({id: Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,14), text: text.trim(), done: false})
    return valid(data) ? JSON.stringify(data) : null
}
