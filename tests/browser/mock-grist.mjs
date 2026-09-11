// Builds a self-contained JS source string that stands in for
// https://docs.getgrist.com/grist-plugin-api.js inside a Playwright page.
// It implements just the surface the widgets actually use (grist.ready,
// onRecord[s], getTable().create/update/getTableId, docApi.getAccessToken,
// docApi.fetchTable, docApi.applyUserActions) against an in-memory
// "document" (`cfg.tables`), and records every call into window.__mockCalls
// for assertions.
//
// cfg shape:
// {
//   widgetTableId: 'Interactions',
//   baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
//   tables: {
//     Interactions: { colIds: ['Objet','Partenaires',...], data: { id: [1,2], Objet: [...], Partenaires: [...] } },
//     Structures: { colIds: [...], data: {...} },
//     ...
//   },
//   mappings: { RoleName: 'RawColId' }  // defaults to identity (role === raw colId) when omitted
//   filterFn: null | (record) => boolean   // simulates a Grist "Select by" link filter
//   cursorRowId: null | number
// }
export function buildMockScript(cfg) {
  // cfg.filterExprSource: source text of a JS predicate, e.g.
  // "(rec) => Array.isArray(rec.Partenaires) && rec.Partenaires.includes(100)"
  // simulating a Grist "Select by" link filter on the widget's own table.
  const filterSrc = cfg.filterExprSource || 'null';
  const cfgForJson = { ...cfg };
  delete cfgForJson.filterExprSource;
  return `
(function() {
  const CFG = ${JSON.stringify(cfgForJson)};
  const FILTER = ${filterSrc};
  const calls = (window.__mockCalls = []);
  let readyOpts = null;
  let onRecordsCb = null;
  let onRecordCb = null;

  function widgetTable() { return CFG.tables[CFG.widgetTableId]; }

  function tableDataToRecords(t) {
    const ids = t.data.id || [];
    return ids.map((id, i) => {
      const rec = { id };
      t.colIds.forEach(c => { rec[c] = (t.data[c] || [])[i]; });
      return rec;
    });
  }

  function currentMappings() {
    if (CFG.mappings) return CFG.mappings;
    const t = widgetTable();
    const m = {};
    (readyOpts && readyOpts.columns || []).forEach(c => {
      if (t.colIds.includes(c.name)) m[c.name] = c.name;
    });
    return m;
  }

  function fireRecords() {
    if (!onRecordsCb) return;
    const t = widgetTable();
    let records = tableDataToRecords(t);
    if (typeof FILTER === 'function') records = records.filter(FILTER);
    onRecordsCb(records, currentMappings());
  }
  function fireRecord() {
    if (!onRecordCb) return;
    const t = widgetTable();
    const records = tableDataToRecords(t);
    const rec = CFG.cursorRowId != null ? (records.find(r => r.id === CFG.cursorRowId) || null) : (records[0] || null);
    onRecordCb(rec, currentMappings());
  }

  function nextId(t) {
    const ids = t.data.id || [];
    return (ids.length ? Math.max(...ids) : 0) + 1;
  }

  function tableApi(tid) {
    return {
      getTableId: () => Promise.resolve(tid),
      create: (arg) => {
        calls.push({ fn: 'create', tableId: tid, arg: JSON.parse(JSON.stringify(arg)) });
        const t = CFG.tables[tid];
        const recs = (arg && Array.isArray(arg.records)) ? arg.records : [arg];
        const results = recs.map(r => {
          const id = nextId(t);
          t.data.id = t.data.id || [];
          t.data.id.push(id);
          t.colIds.forEach(c => {
            t.data[c] = t.data[c] || [];
            t.data[c].push((r && r.fields ? r.fields[c] : undefined) ?? null);
          });
          return { id };
        });
        fireRecords(); fireRecord();
        return Promise.resolve((arg && Array.isArray(arg.records)) ? results : results[0]);
      },
      update: (arg) => {
        calls.push({ fn: 'update', tableId: tid, arg: JSON.parse(JSON.stringify(arg)) });
        const t = CFG.tables[tid];
        const items = Array.isArray(arg) ? arg : [arg];
        items.forEach(item => {
          const idx = (t.data.id || []).indexOf(item.id);
          if (idx >= 0) {
            Object.keys(item.fields || {}).forEach(k => {
              t.data[k] = t.data[k] || [];
              t.data[k][idx] = item.fields[k];
            });
          }
        });
        fireRecords(); fireRecord();
        return Promise.resolve();
      }
    };
  }

  const options = (CFG.options ? { ...CFG.options } : {});

  window.grist = {
    ready(opts) { readyOpts = opts; calls.push({ fn: 'ready', opts }); },
    onRecords(cb) { onRecordsCb = cb; setTimeout(fireRecords, 0); },
    onRecord(cb) { onRecordCb = cb; setTimeout(fireRecord, 0); },
    getOption(key) { return Promise.resolve(options[key]); },
    setOption(key, value) {
      calls.push({ fn: 'setOption', key, value });
      options[key] = value;
      return Promise.resolve();
    },
    setCursorPos(pos) {
      calls.push({ fn: 'setCursorPos', pos });
      CFG.cursorRowId = pos && pos.rowId;
      setTimeout(() => { fireRecords(); fireRecord(); }, 0);
      return Promise.resolve();
    },
    getTable(tableId) { return tableApi(tableId || CFG.widgetTableId); },
    docApi: {
      getAccessToken: () => Promise.resolve({ token: 'mocktoken', baseUrl: CFG.baseUrl }),
      fetchTable: (tableId) => {
        const t = CFG.tables[tableId];
        if (!t) return Promise.reject(new Error('mock: no such table ' + tableId));
        const out = { id: t.data.id || [] };
        t.colIds.forEach(c => { out[c] = t.data[c] || []; });
        return Promise.resolve(out);
      },
      // How a widget writes to a table it isn't mapped onto. Supports the
      // three row actions the CRM widget uses; anything else is recorded
      // but not applied, so a test asserting on it still sees the call.
      applyUserActions: (actions) => {
        calls.push({ fn: 'applyUserActions', actions: JSON.parse(JSON.stringify(actions)) });
        const retValues = [];
        (actions || []).forEach(action => {
          const [verb, tid, rowId, fields] = action;
          const t = CFG.tables[tid];
          if (!t) throw new Error('mock: no such table ' + tid);
          t.data.id = t.data.id || [];
          if (verb === 'AddRecord') {
            const id = nextId(t);
            t.data.id.push(id);
            // A field written to a column the fixture didn't declare still
            // has to exist afterwards — Grist would have created the cell.
            Object.keys(fields || {}).forEach(k => { if (!t.colIds.includes(k)) t.colIds.push(k); });
            t.colIds.forEach(c => {
              t.data[c] = t.data[c] || [];
              while (t.data[c].length < t.data.id.length - 1) t.data[c].push(null);
              t.data[c].push((fields && c in fields) ? fields[c] : null);
            });
            retValues.push(id);
          } else if (verb === 'UpdateRecord') {
            const idx = t.data.id.indexOf(rowId);
            if (idx >= 0) {
              Object.keys(fields || {}).forEach(k => {
                if (!t.colIds.includes(k)) t.colIds.push(k);
                t.data[k] = t.data[k] || [];
                t.data[k][idx] = fields[k];
              });
            }
            retValues.push(null);
          } else if (verb === 'RemoveRecord') {
            const idx = t.data.id.indexOf(rowId);
            if (idx >= 0) {
              t.data.id.splice(idx, 1);
              t.colIds.forEach(c => { if (t.data[c]) t.data[c].splice(idx, 1); });
            }
            retValues.push(null);
          } else {
            retValues.push(null);
          }
        });
        if (CFG.tables[CFG.widgetTableId]) { fireRecords(); fireRecord(); }
        return Promise.resolve({ retValues });
      }
    }
  };
})();
`;
}
