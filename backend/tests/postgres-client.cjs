// A small Prisma-shaped test adapter. SQL, constraints, triggers, rollback, and
// migrations run in PostgreSQL (PGlite). Its single connection serializes tests;
// production multi-connection lock contention still requires real Postgres.
function postgresClient(pg) {
  const tables = ['multiplayer_rooms', 'multiplayer_room_members', 'multiplayer_games', 'multiplayer_players', 'multiplayer_guesses'];
  const relations = {
    'multiplayer_games.players': ['multiplayer_players', 'game_id', 'id'],
    'multiplayer_room_members.participations': ['multiplayer_players', 'member_id', 'id'],
  };
  const quote = name => `"${name}"`;
  const client = {};
  const params = values => value => { values.push(typeof value === 'bigint' ? value.toString() : value); return `$${values.length}`; };
  function whereSql(table, where, bind) {
    return Object.entries(where ?? {}).map(([key, value]) => {
      if (key === 'game_id_player_id_round_number') return whereSql(table, value, bind);
      const column = `${quote(table)}.${quote(key)}`;
      if (value === null) return `${column} IS NULL`;
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('not' in value) return value.not === null ? `${column} IS NOT NULL` : `${column} <> ${bind(value.not)}`;
        if ('some' in value) {
          const [child, fk, pk] = relations[`${table}.${key}`];
          return `EXISTS (SELECT 1 FROM ${quote(child)} WHERE ${quote(child)}.${quote(fk)} = ${quote(table)}.${quote(pk)} AND ${whereSql(child, value.some, bind)})`;
        }
        throw new Error(`Unsupported where ${key}`);
      }
      return `${column} = ${bind(value)}`;
    }).join(' AND ') || 'true';
  }
  async function shape(table, row, options) {
    const result = options.select ? {} : { ...row };
    for (const [key, selection] of Object.entries({ ...options.include, ...options.select })) {
      if (!selection) continue;
      const relation = relations[`${table}.${key}`];
      if (relation) {
        const [child, fk, pk] = relation;
        result[key] = await client[child].findMany({ ...selection, where: { ...selection.where, [fk]: row[pk] } });
      } else result[key] = row[key];
    }
    return result;
  }
  for (const table of tables) {
    const api = client[table] = {};
    api.findMany = async (options = {}) => {
      const values = [], bind = params(values);
      let sql = `SELECT * FROM ${quote(table)} WHERE ${whereSql(table, options.where, bind)}`;
      if (options.orderBy) sql += ' ORDER BY ' + [options.orderBy].flat().flatMap(order => Object.entries(order).map(([key, dir]) => `${quote(key)} ${dir}`)).join(', ');
      if (options.take !== undefined) sql += ` LIMIT ${bind(options.take)}`;
      if (options.skip !== undefined) sql += ` OFFSET ${bind(options.skip)}`;
      const { rows } = await pg.query(sql, values);
      return Promise.all(rows.map(row => shape(table, row, options)));
    };
    api.findUnique = api.findFirst = async options => (await api.findMany({ ...options, take: 1 }))[0] ?? null;
    api.count = async (options = {}) => (await api.findMany(options)).length;
    api.create = async ({ data }) => {
      const values = [], bind = params(values);
      const entries = Object.entries(data).filter(([key]) => !relations[`${table}.${key}`]);
      if (entries.length === 0) return (await pg.query(`INSERT INTO ${quote(table)} DEFAULT VALUES RETURNING *`)).rows[0];
      const { rows } = await pg.query(`INSERT INTO ${quote(table)} (${entries.map(([key]) => quote(key)).join(',')}) VALUES (${entries.map(([key, value]) => bind(key === 'round_history' || key === 'last_round_reveal' ? JSON.stringify(value) : value)).join(',')}) RETURNING *`, values);
      for (const [key, value] of Object.entries(data)) if (relations[`${table}.${key}`]) {
        const [child, fk, pk] = relations[`${table}.${key}`];
        for (const childData of value.create) await client[child].create({ data: { ...childData, [fk]: rows[0][pk] } });
      }
      return rows[0];
    };
    async function update({ where, data }) {
      const values = [], bind = params(values);
      const sets = Object.entries(data).map(([key, value]) => `${quote(key)} = ${value && typeof value === 'object' && 'increment' in value ? `${quote(key)} + ${bind(value.increment)}` : bind(key === 'round_history' || key === 'last_round_reveal' ? JSON.stringify(value) : value)}`);
      return (await pg.query(`UPDATE ${quote(table)} SET ${sets.join(',')} WHERE ${whereSql(table, where, bind)} RETURNING *`, values)).rows;
    }
    api.update = async options => (await update(options))[0];
    api.updateMany = async options => ({ count: (await update(options)).length });
  }
  client.$queryRaw = async (parts, ...values) => (await pg.query(parts.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, ''), values)).rows;
  client.$transaction = async work => {
    if (Array.isArray(work)) return Promise.all(work);
    return pg.transaction(async tx => work(postgresClient(tx)));
  };
  return client;
}
module.exports = { postgresClient };
