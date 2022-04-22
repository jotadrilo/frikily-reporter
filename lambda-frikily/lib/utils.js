function render(src, map = {}) {
    let template = src
    for (const [key, value] of Object.entries(map)) {
        template = template.replace(`{{${key}}}`, value)
    }
    return template
}

module.exports = {
    render: render
}
