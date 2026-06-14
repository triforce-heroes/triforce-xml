# AGENTS.md

## Visão geral

Este pacote extrai textos traduzíveis de arquivos XML e permite reconstruir esses XMLs com traduções aplicadas. Ele faz parte do ecossistema `@triforce-heroes` e substituiu uma abordagem anterior baseada em arquivos binários `.uasset`.

A API pública é simples:

- `extract(xml)` &rarr; lista de entradas traduzíveis.
- `rebuild(sourceXml, replacements)` &rarr; XML reconstruído a partir do original aplicando traduções.
- `rebuildRaw(document)` &rarr; XML construído do zero a partir de uma AST (`XMLRoot`).

## Formato dos XMLs suportados

O XML deve ter a seguinte estrutura:

```xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<translation lang="English" helplang="en">
  <dialog name="IDD_EXAMPLE" id="1" caption="Example">
    <res id="1" text="Hello" />
    <res id="2" text="World" />
  </dialog>
  <menu id="2">
    <res id="1" text="Start" />
  </menu>
  <string type="system" id="3">
    <res id="1" text="OK" />
  </string>
</translation>
```

- O elemento raiz é obrigatoriamente `<translation>`.
- Contêineres reconhecidos: `<dialog>`, `<menu>` e `<string>`.
- Cada contêiner tem um atributo numérico `id`.
- Cada contêiner pode ter `<res id="..." text="..." />` como filhos.
- `<dialog>` pode ter `caption="..."`, que também é traduzível.
- `<string>` pode ter `type="..."`, usado como prefixo da referência.
- O atributo `lang` do `<translation>` é exposto como entrada de referência `"lang"`.

### Referências

Cada texto traduzível é endereçado por uma `reference`:

- `lang` &rarr; atributo `lang` do `<translation>`.
- `{tag}.{name}.caption` &rarr; atributo `caption` de um `<dialog>`. Se o contêiner não tiver `name`, usa `id`.
- `{tag}.{name}.{resId}` &rarr; atributo `text` de um `<res>` dentro de um `<dialog>` ou `<menu>`. Se o contêiner não tiver `name`, usa `id`.
- `{tag}.{name}.{resId}.regex` &rarr; atributo `regex` de um `<res>` (suportado em qualquer contêiner).
- Contêineres `<string type="...">` usam o formato `string.{type}.{resId}` para `text` e `string.{type}.{resId}.regex` para `regex`. Se não tiver `type`, usa `string.{id}.{resId}`.

Exemplo:

- `dialog.IDD_EXAMPLE.caption`
- `dialog.IDD_EXAMPLE.1`
- `dialog.IDD_EXAMPLE.1.regex`
- `menu.IDR_MAIN.1`
- `string.system.1`

### Resolução de `refid` e `copyid`

- `refid` em um `<res>` aponta para outro recurso. O `extract` resolve essa indireção e retorna o texto final, mas a referência continua sendo a do `<res>` original.
- `copyid` em um contêiner indica que ele reaproveita os recursos de outro contêiner. No `extract`, isso é transparente: os textos são resolvidos como se pertencessem ao contêiner copiador.
- No `rebuild`, contêineres com `copyid` permanecem vazios se nenhum de seus recursos efetivos for traduzido. Se houver tradução, o contêiner é expandido (o `copyid` é removido e os `<res>` são materializados).

## Decisões arquiteturais

### 1. XML em vez de binário

O projeto original manipulava arquivos `.uasset`. A nova versão trabalha diretamente com XML de tradução porque:

- Os XMLs são a fonte primária das strings.
- Permitem diff legível e edição manual.
- Evitam dependência de parsers binários específicos.

### 2. Parser/serializador: `xml-js` com `compact: false`

Escolhemos `xml-js` porque é leve e bem conhecido. Usamos `compact: false` para obter uma AST explícita e ter controle total sobre quais elementos e atributos são preservados.

`xml-js` **não** escapa `&`, `<` e `>` em atributos durante a serialização (escapa apenas `"` para `&quot;`). Por isso existe o `escapeAttributes`/`escapeAttributeValue` em `XmlService.ts`. Sem esse escaping, textos com esses caracteres gerariam XML inválido.

### 3. Saída prettified, não byte-identical

A saída do `rebuild` é um XML válido e bem formatado, mas **não** garante byte-identical com o arquivo original. Decidimos isso porque:

- `xml-js` não preserva whitespace arbitrário, comentários ou ordenação exata de atributos.
- O importante para tradução é a semântica, não a formatação original.
- A saída usa tabulação para indentação, quebras de linha LF e tags vazias autocontidas (`<res ... />`).

### 4. `resource` removido de `ExtractedEntry`

A interface `ExtractedEntry` contém apenas `reference` e `text`. O campo `resource` existia historicamente para identificar o arquivo binário de origem, mas não faz sentido no contexto XML. Ele foi removido para simplificar. Em `tools/watch.ts`, o campo `resource` é enviado como string vazia (`""`) para compatibilidade com `@triforce-heroes/triforce-publisher`, que não aceita `NULL`.

### 5. `ExtractedEntry` não distingue `refid`/`copyid`

O `extract` resolve `refid` e `copyid` de forma transparente. Quem consome as entradas vê apenas textos finais e referências estáveis. A complexidade da indireção fica concentrada em `ReferenceService.ts`.

### 6. `rebuildRaw` é construtor de XML genérico

`rebuildRaw(document)` aceita um `XMLRoot` e serializa um XML. Ele é usado internamente pelo `rebuild`, mas também pode ser usado para gerar XMLs do zero. A serialização sempre inclui `id` nos atributos dos contêineres e recursos, mesmo que o `XMLRoot` não os tenha explicitamente nos mapas de atributos.

## Testes

### `tests/Extract.test.ts`

Para cada `lang-*.xml` em `tests/fixtures`:

- Faz `extract`.
- Gera/verifica snapshot em `tests/fixtures/lang-*.xml.snap`.

Filtra arquivos `.rebuilded.xml` para não processá-los como originais.

### `tests/Rebuild.test.ts`

Para cada `lang-*.xml` em `tests/fixtures`:

- Faz `rebuild` com mapa de substituições vazio.
- Gera `tests/fixtures/lang-*.rebuilded.xml`.
- Gera/verifica snapshot do `extract` do rebuilded em `tests/fixtures/lang-*.rebuilded.xml.snap`.
- Garante `extract(rebuilt) === extract(source)`.

Também contém testes unitários para:

- `rebuildRaw` construindo XML do zero.
- Escaping de caracteres especiais.
- Substituições de `lang`, `caption` e textos de recursos.
- Comportamento de `copyid` (expansão vs. colapso).

Arquivos `.rebuilded.*` são ignorados pelo `.gitignore` e recriados sob demanda ao rodar os testes.

## Cuidados ao modificar

- Sempre rode `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` antes de finalizar.
- Se alterar `serializeXml`, verifique se os XMLs gerados ainda são válidos (especialmente atributos com `&`, `<`, `>`).
- Se alterar `buildReference` ou `getResourceText`, os snapshots dos fixtures provavelmente mudarão e precisarão ser regenerados com `npx vitest run -u`.
- Não assuma que o `rebuild` preserve formatação original; ele preserva semântica.

## Dependências importantes

- `xml-js`: parser/serializador XML.
- `@triforce-heroes/triforce-publisher`: usado em `tools/watch.ts` para gerar queries SQL.
- `@triforce-heroes/triforce-core`: utilitários como `chunk`.
