const { importedName, resolveVariable, zodImportSpecifier } = require('./zod-binding.cjs');

const ZOD_TYPE_HELPERS = new Set(['infer', 'input', 'output']);
const ZOD_NAMESPACE_SPECIFIERS = new Set(['ImportNamespaceSpecifier', 'ImportDefaultSpecifier']);

const DEFAULT_SCHEMA_FILES = ['\\.schema\\.[cm]?tsx?$', '/schemas/.+\\.[cm]?tsx?$'];

const isZodModuleObject = (scope, node) => {
  const specifier = node.type === 'Identifier' ? zodImportSpecifier(scope, node.name) : null;
  return specifier !== null && ZOD_NAMESPACE_SPECIFIERS.has(specifier.type);
};

const isZodNamespace = (scope, node) => {
  if (node.type === 'TSQualifiedName') {
    return node.right.name === 'z' && isZodModuleObject(scope, node.left);
  }
  const specifier = zodImportSpecifier(scope, node.name);
  if (specifier === null) {
    return node.name === 'z' && resolveVariable(scope, node.name) === null;
  }
  return ZOD_NAMESPACE_SPECIFIERS.has(specifier.type) || importedName(specifier) === 'z';
};

const isZodTypeHelper = (scope, { typeName }) => {
  if (typeName.type === 'TSQualifiedName') {
    return ZOD_TYPE_HELPERS.has(typeName.right.name) && isZodNamespace(scope, typeName.left);
  }
  const specifier = typeName.type === 'Identifier' ? zodImportSpecifier(scope, typeName.name) : null;
  return specifier?.type === 'ImportSpecifier' && ZOD_TYPE_HELPERS.has(importedName(specifier));
};

const queriedSchemaName = (node) => {
  const [argument] = (node.typeArguments ?? node.typeParameters)?.params ?? [];
  return argument?.type === 'TSTypeQuery' && argument.exprName.type === 'Identifier'
    ? argument.exprName.name
    : null;
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
        const scope = context.sourceCode.getScope(node);
        if (!isZodTypeHelper(scope, node)) {
          return;
        }
        const schema = queriedSchemaName(node);
        const isLocalSchema = schema !== null && isModuleConst(resolveVariable(scope, schema));
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
