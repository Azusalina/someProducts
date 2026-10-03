.pragma library

var modules = ["cpu", "ram", "ping", "gpu", "media", "note", "proton", "wifi", "bluetooth", "terminal"]

function sequence(saved) {
    const order = (saved || "").split(",").filter((key, index, values) => modules.includes(key) && values.indexOf(key) === index)
    return order.concat(modules.filter(key => !order.includes(key)))
}
function label(key) {
    return ({cpu: "CPU", ram: "RAM", ping: "Ping", gpu: "GPU", media: "Now playing", note: "Note",
             proton: "Proton VPN", wifi: "Wi-Fi", bluetooth: "Bluetooth", terminal: "Terminal"})[key] || key
}
function move(saved, key, offset) {
    const order = sequence(saved)
    const at = order.indexOf(key)
    const to = at + offset
    if (at < 0 || to < 0 || to >= order.length) return order.join(",")
    order.splice(at, 1)
    order.splice(to, 0, key)
    return order.join(",")
}
function drop(saved, source, target) {
    const order = sequence(saved)
    const from = order.indexOf(source)
    const to = order.indexOf(target)
    if (from < 0 || to < 0 || source === target) return order.join(",")
    order.splice(from, 1)
    order.splice(to, 0, source)
    return order.join(",")
}
function toggle(saved, key) {
    const enabled = (saved || "").split(",").filter(Boolean)
    const at = enabled.indexOf(key)
    if (at >= 0) enabled.splice(at, 1)
    else enabled.push(key)
    return enabled.join(",")
}
