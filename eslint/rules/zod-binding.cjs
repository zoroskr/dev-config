const { memberName } = require('./app-router.cjs');

const ZOD_CONSTRUCTORS = new Set([
  'any',
  'array',
  'base64',
  'base64url',
  'bigint',
  'boolean',
  'catch',
  'cidrv4',
  'cidrv6',
  'cuid',
  'cuid2',
  'custom',
  'date',
  'discriminatedUnion',
  'e164',
  'email',
  'emoji',
  'enum',
  'file',
  'float32',
  'float64',
  'function',
  'guid',
  'hash',
  'hex',
  'hostname',
  'instanceof',
  'int',
  'int32',
  'int64',
  'intersection',
  'ipv4',
  'ipv6',
  'json',
  'jwt',
  'keyof',
  'lazy',
  'literal',
  'looseObject',
  'map',
  'nan',
  'nanoid',
  'nativeEnum',
  'never',
  'nonoptional',
  'null',
  'nullable',
  'nullish',
  'number',
  'object',
  'optional',
  'partialRecord',
  'pipe',
  'preprocess',
  'promise',
  'readonly',
  'record',
  'set',
  'strictObject',
  'string',
  'stringbool',
  'symbol',
  'templateLiteral',
  'transform',
  'tuple',
  'uint32',
  'uint64',
  'ulid',
  'undefined',
  'union',
  'unknown',
  'url',
  'uuid',
  'uuidv4',
  'uuidv6',
  'uuidv7',
  'void',
]);
const ZOD_FACTORIES = new Set(['coerce', 'iso']);

const isZodModule = source => source === 'zod' || source.startsWith('zod/');

const resolveVariable = (scope, name) => {
  for (let current = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return null;
};

const zodImportSpecifier = (scope, name) => {
  const definition = resolveVariable(scope, name)?.defs[0];
  return definition?.type === 'ImportBinding' && isZodModule(definition.parent.source.value)
    ? definition.node
    : null;
};

const importedName = specifier => (specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value);

const zodRoot = (scope, name) => {
  const specifier = zodImportSpecifier(scope, name);
  if (specifier === null) {
    return name === 'z' ? [] : null;
  }
  return specifier.type === 'ImportSpecifier' && importedName(specifier) !== 'z' ? [importedName(specifier)] : [];
};

const zodPath = (scope, node) => {
  if (node.type === 'Identifier') {
    return zodRoot(scope, node.name);
  }
  const parent = node.type === 'MemberExpression' ? zodPath(scope, node.object) : null;
  const name = parent === null ? null : memberName(node);
  return name === null ? null : [...parent, name];
};

const isZodConstructor = (scope, { callee }) => {
  const path = zodPath(scope, callee) ?? [];
  const [kind, member, ...rest] = path[0] === 'z' ? path.slice(1) : path;
  if (rest.length > 0) {
    return false;
  }
  return member === undefined ? ZOD_CONSTRUCTORS.has(kind) : ZOD_FACTORIES.has(kind);
};

module.exports = { importedName, isZodConstructor, resolveVariable, zodImportSpecifier };
