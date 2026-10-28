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

module.exports = { resolveVariable, zodImportSpecifier };
