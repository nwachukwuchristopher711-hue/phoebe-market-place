// chat.js - private chat between buyers and sellers (Phoebe Market Place)
(function () {
  var st = document.createElement('style');
  st.textContent = [
    '.conv{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:10px;text-decoration:none;color:var(--text)}',
    '.conv .cb{min-width:0;flex:1}',
    '.conv .cl{color:var(--muted);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.chat{display:flex;flex-direction:column;gap:8px;padding:6px 0 12px}',
    '.bub{max-width:82%;padding:9px 12px;border-radius:16px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.bub span{display:block;font-size:11px;opacity:.65;margin-top:3px;text-align:right}',
    '.bub.me{align-self:flex-end;background:var(--green);color:#04210f;border-bottom-right-radius:4px}',
    '.bub.them{align-self:flex-start;background:var(--card2);border-bottom-left-radius:4px}',
    '.chat-send{position:sticky;bottom:72px;display:flex;gap:8px;align-items:flex-end;background:var(--bg);padding:8px 0}',
    '.chat-send textarea{margin-top:0;resize:none;max-height:120px}',
    '.chat-send button{flex:none}'
  ].join('');
  document.head.appendChild(st);

  var pollTimer = null;
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  var LOGIN = '<div class="panel empty">Log in or register to use chat.<br><br><a class="btn" href="#/account">Go to Profile</a></div>';

  function when(iso) {
    var d = new Date(iso), now = new Date();
    var t = d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return t;
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) + ', ' + t;
  }

  async function namesFor(ids) {
    var map = {};
    if (!ids.length) return map;
    var r = await sb.from('public_profiles').select('id,display_name').in('id', ids);
    (r.data || []).forEach(function (p) { map[p.id] = p.display_name; });
    return map;
  }

  // ---------- Messages list ----------
  async function listView() {
    app.innerHTML = '<h2 class="page">Messages</h2>' + (user ? '<div class="spin">Loading…</div>' : LOGIN);
    if (!user) return;
    try {
      var cr = await sb.from('conversations').select('id,product_id,buyer_id,seller_id,created_at').order('created_at', { ascending: false });
      if (cr.error) throw cr.error;
      var convs = cr.data || [];
      if (!convs.length) {
        app.innerHTML = '<h2 class="page">Messages</h2><div class="panel empty"><div style="font-size:42px">&#128172;</div><p style="margin-top:8px">No chats yet.<br>Open a product and tap <strong style="color:var(--text)">Message seller</strong> to start one.</p></div>';
        return;
      }
      var convIds = convs.map(function (c) { return c.id; });
      var prodIds = convs.map(function (c) { return c.product_id; });
      var otherIds = convs.map(function (c) { return c.buyer_id === user.id ? c.seller_id : c.buyer_id; });
      var res = await Promise.all([
        sb.from('messages').select('conversation_id,body,created_at').in('conversation_id', convIds).order('created_at', { ascending: false }).limit(300),
        sb.from('products').select('id,title').in('id', prodIds),
        namesFor(otherIds)
      ]);
      var last = {};
      (res[0].data || []).forEach(function (m) { if (!last[m.conversation_id]) last[m.conversation_id] = m; });
      var titles = {};
      (res[1].data || []).forEach(function (p) { titles[p.id] = p.title; });
      var names = res[2];
      convs.sort(function (a, b) {
        var ta = (last[a.id] || a).created_at, tb = (last[b.id] || b).created_at;
        return new Date(tb) - new Date(ta);
      });
      var rows = convs.map(function (c) {
        var oid = c.buyer_id === user.id ? c.seller_id : c.buyer_id;
        var nm = names[oid] || (c.buyer_id === user.id ? 'Seller' : 'Buyer');
        var m = last[c.id];
        return '<a class="conv" href="#/messages/' + encodeURIComponent(c.id) + '"><div class="avatar">' + esc(nm.charAt(0).toUpperCase()) + '</div>' +
          '<div class="cb"><strong>' + esc(nm) + '</strong><div class="small">' + esc(titles[c.product_id] || 'Item no longer available') + '</div>' +
          '<div class="cl">' + esc(m ? m.body : 'No messages yet') + '</div></div>' +
          (m ? '<div class="small">' + esc(when(m.created_at)) + '</div>' : '') + '</a>';
      }).join('');
      app.innerHTML = '<h2 class="page">Messages</h2>' + rows;
    } catch (e) {
      app.innerHTML = '<h2 class="page">Messages</h2>' + msg('err', nice(e)) + '<button class="full" onclick="route()">Try again</button>';
    }
  }

  // ---------- One chat ----------
  async function threadView(id) {
    stopPoll();
    if (!user) { app.innerHTML = LOGIN; return; }
    app.innerHTML = '<div class="spin">Loading…</div>';
    try {
      var cr = await sb.from('conversations').select('id,product_id,buyer_id,seller_id').eq('id', id).maybeSingle();
      if (cr.error) throw cr.error;
      var c = cr.data;
      if (!c) { app.innerHTML = '<a class="back" href="#/messages">&larr; Messages</a><div class="panel empty">This chat was not found.</div>'; return; }
      var oid = c.buyer_id === user.id ? c.seller_id : c.buyer_id;
      var res = await Promise.all([
        namesFor([oid]),
        sb.from('products').select('id,title,price_kobo').eq('id', c.product_id).maybeSingle()
      ]);
      var nm = res[0][oid] || (c.buyer_id === user.id ? 'Seller' : 'Buyer');
      var p = res[1].data;
      app.innerHTML =
        '<a class="back" href="#/messages">&larr; Messages</a>' +
        '<div class="panel seller" style="margin-top:8px"><div class="avatar">' + esc(nm.charAt(0).toUpperCase()) + '</div>' +
        '<div><strong>' + esc(nm) + '</strong><div class="small">' +
        (p ? '<a href="#/p/' + encodeURIComponent(p.id) + '">' + esc(p.title) + '</a> &middot; ' + naira(p.price_kobo) : 'Item no longer available') +
        '</div></div></div>' +
        '<div class="small" style="margin-bottom:6px">Do not pay before you meet and check the item. <a href="safety.html">Safety tips</a></div>' +
        '<div id="chat-list" class="chat"></div>' +
        '<div id="chat-msg"></div>' +
        '<div class="chat-send"><textarea id="chat-in" rows="1" maxlength="1000" placeholder="Type a message" aria-label="Message"></textarea><button id="chat-go">Send</button></div>';

      var lastKey = '';
      async function load(force) {
        var box = document.getElementById('chat-list');
        if (!box) return;
        var r = await sb.from('messages').select('id,sender_id,body,created_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(500);
        if (r.error) { if (force) document.getElementById('chat-msg').innerHTML = msg('err', nice(r.error)); return; }
        var data = r.data || [];
        var key = data.length + ':' + (data.length ? data[data.length - 1].id : '');
        if (key === lastKey) return;
        var nearBottom = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 160;
        var first = lastKey === '';
        lastKey = key;
        box.innerHTML = data.length ? data.map(function (m) {
          return '<div class="bub ' + (m.sender_id === user.id ? 'me' : 'them') + '">' + esc(m.body) + '<span>' + esc(when(m.created_at)) + '</span></div>';
        }).join('') : '<div class="empty">No messages yet. Say hello.</div>';
        if (first || nearBottom || force) window.scrollTo(0, document.body.scrollHeight);
      }

      var go = document.getElementById('chat-go');
      var inp = document.getElementById('chat-in');
      var sending = false;
      go.onclick = async function () {
        var text = inp.value.trim();
        if (!text || sending) return;
        sending = true; go.disabled = true;
        var out = document.getElementById('chat-msg');
        var r = await sb.from('messages').insert({ conversation_id: id, sender_id: user.id, body: text });
        sending = false; go.disabled = false;
        if (r.error) { out.innerHTML = msg('err', nice(r.error)); return; }
        out.innerHTML = ''; inp.value = ''; lastKey = '';
        await load(true);
      };

      await load(true);
      pollTimer = setInterval(function () {
        var h = decodeURIComponent(location.hash || '');
        if (h !== '#/messages/' + id || !document.getElementById('chat-list')) { stopPoll(); return; }
        if (!document.hidden) load(false);
      }, 5000);
    } catch (e) {
      app.innerHTML = '<a class="back" href="#/messages">&larr; Messages</a>' + msg('err', nice(e));
    }
  }

  window.viewMessages = function () {
    stopPoll();
    var h = decodeURIComponent(location.hash || '');
    if (h.indexOf('#/messages/') === 0 && h.length > 11) return threadView(h.slice(11));
    return listView();
  };

  // ---------- "Message seller" button on the product page ----------
  var origProduct = window.viewProduct;
  window.viewProduct = async function (id) {
    stopPoll();
    await origProduct(id);
    try { await addMessageButton(id); } catch (e) { /* leave the page as it is */ }
  };

  async function addMessageButton(id) {
    var note = null;
    app.querySelectorAll('.msg.ok').forEach(function (el) { if (/Ordering and chat/i.test(el.textContent)) note = el; });
    if (!note) return;
    var r = await sb.from('products').select('id,seller_id,status').eq('id', id).maybeSingle();
    var p = r.data;
    if (!p || p.status !== 'active' || (user && user.id === p.seller_id)) return;
    var box = document.createElement('div');
    box.className = 'panel';
    box.innerHTML = '<strong>Interested?</strong><div class="small" style="margin:4px 0 0">Message the seller privately here. Do not pay before you meet and check the item. <a href="safety.html">Safety tips</a></div>' +
      '<button class="full" id="msg-seller">' + (user ? 'Message seller' : 'Log in to message seller') + '</button><div id="msg-seller-out"></div>';
    note.replaceWith(box);
    var btn = document.getElementById('msg-seller');
    btn.onclick = async function () {
      if (!user) { location.hash = '#/account'; return; }
      var out = document.getElementById('msg-seller-out');
      btn.disabled = true; btn.textContent = 'Opening chat…'; out.innerHTML = '';
      try {
        var ex = await sb.from('conversations').select('id').eq('buyer_id', user.id).eq('product_id', id).maybeSingle();
        if (ex.error) throw ex.error;
        var convId = ex.data && ex.data.id;
        if (!convId) {
          var ins = await sb.from('conversations').insert({ product_id: id, buyer_id: user.id, seller_id: p.seller_id }).select('id').single();
          if (ins.error) throw ins.error;
          convId = ins.data.id;
        }
        location.hash = '#/messages/' + encodeURIComponent(convId);
      } catch (e) {
        out.innerHTML = msg('err', nice(e));
        btn.disabled = false; btn.textContent = 'Message seller';
      }
    };
  }
})();
