const ZOD_TYPE_HELPERS = new Set(['infer', 'input', 'output']);

const DEFAULT_SCHEMA_FILES = ['\\.schema\\.[cm]?tsx?$', '/schemas/.+\\.[cm]?tsx?$'];

const isZodTypeHelper = node => node.typeName.type === 'TSQualifiedName'
  && node.typeName.left.type === 'Identifier'
  && node.typeName.left.name === 'z'
  && ZOD_TYPE_HELPERS.has(node.typeName.right.name);

const queriedSchemaName = (node) => {
  const [argument] = (node.typeArguments ?? node.typeParameters)?.params ?? [];
  return argument?.type === 'TSTypeQuery' && argument.exprName.type === 'Identifier'
    ? argument.exprName.name
    : null;
};

const resolveVariable = (scope, name) => {
  for (let current = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return null;
};

const isModuleConst = variable => variable !== null
  && (variable.scope.type === 'module' || variable.scope.type === 'global')
  && variable.defs.some(definition => definition.type === 'Variable' && definition.parent.kind === 'const');

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { schemaFiles: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      inlineInfer: 'Import the type exported next to the schema instead of deriving it here from `{{schema}}`. If it is missing, add `export type X = z.infer<typeof {{schema}}>` to that schema\'s file. See skill `zod-schemas`.',
    },
  },
  create(context) {
    const schemaFiles = (context.options[0]?.schemaFiles ?? DEFAULT_SCHEMA_FILES).map(
      // eslint-disable-next-line security/detect-non-literal-regexp -- consumer-provided schema file patterns
      source => new RegExp(source, 'u'),
    );
    const filename = context.filename.replaceAll('\\', '/');
    const isSchemaFile = schemaFiles.some(pattern => pattern.test(filename));

    return {
      TSTypeReference(node) {
        if (!isZodTypeHelper(node)) {
          return;
        }
        const schema = queriedSchemaName(node);
        const isLocalSchema = schema !== null && isModuleConst(resolveVariable(context.sourceCode.getScope(node), schema));
        const isAllowed = isSchemaFile
          ? isLocalSchema
          : isLocalSchema && node.parent.type === 'TSTypeAliasDeclaration' && node.parent.typeAnnotation === node;
        if (!isAllowed) {
          context.report({ node, messageId: 'inlineInfer', data: { schema: schema ?? 'the schema' } });
        }
      },
    };
  },
};
