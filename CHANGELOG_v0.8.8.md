# v0.8.8 — fontes locais dentro do Master

- Exportação pública ativa deviceMode e factoryBase vazio.
- Perfis separados por domínio em storage do LNReader; seletor de fonte persistente.
- URL na busca aprende/ativa a fonte e retorna livros reais, sem cartão de instalação.
- Perfil bloqueado permanece disponível para tentativa após WebView.
- Metadados, refinamentos, configuração e tradução não chamam servidor local.
- API keys opcionais nas configurações; Google como padrão de tradução inicial.
- 15 leitores públicos por idioma, com retradução direta pelo Google.
- Categoria salva de outro domínio não redireciona a navegação da fonte ativa.
- Fluxo Termux preservado apenas como modo legado de desenvolvimento.

Não instala filhos independentes: fontes são acessadas dentro da extensão pai.
Não modifica APK nem certifica suporte a sites ainda pendentes, como NovelLive.

Validação: suítes Python/Node, parsers com Cheerio real, persistência entre instâncias,
isolamento de hosts, seleção, configuração local e leitor gerado sem servidor.
Rede simulada; não é validação end-to-end no Android.
