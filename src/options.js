function normalizeHost(input) {
    try {
        if (!input) return '';
        input = input.trim().toLowerCase();
        // if user pasted a full URL, extract hostname
        if (input.includes('://')) {
            const url = new URL(input);
            return url.hostname.replace(/^www\./, '');
        }
        // remove path if present
        input = input.split('/')[0];
        input = input.replace(/^www\./, '');
        return input;
    } catch (e) {
        return '';
    }
}

function render(list) {
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    list.forEach((host, idx) => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.className = 'host';
        span.textContent = host;
        const btn = document.createElement('button');
        btn.className = 'remove';
        btn.textContent = 'Remove';
        btn.addEventListener('click', () => {
            list.splice(idx, 1);
            save(list);
            render(list);
        });
        li.appendChild(span);
        li.appendChild(btn);
        ul.appendChild(li);
    });
}

function save(list) {
    chrome.storage.local.set({ blocked: list });
}

function loadAndRender() {
    chrome.storage.local.get({ blocked: [] }, (res) => {
        const list = res.blocked || [];
        render(list);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadAndRender();
    const addBtn = document.getElementById('addBtn');
    const input = document.getElementById('domainInput');
    addBtn.addEventListener('click', () => {
        const host = normalizeHost(input.value);
        if (!host) return alert('Please enter a valid domain or URL');
        chrome.storage.local.get({ blocked: [] }, (res) => {
            const list = res.blocked || [];
            if (!list.includes(host)) {
                list.push(host);
                save(list);
                render(list);
                input.value = '';
            } else {
                alert('Domain already in list');
            }
        });
    });
});
