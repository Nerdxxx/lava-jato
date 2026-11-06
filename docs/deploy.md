# Colocar no ar (produção)

O sistema roda em qualquer servidor Linux com Docker (VPS de ~R$ 30–60/mês: Hostinger, Contabo, DigitalOcean, Hetzner etc.). Requisitos: 1 vCPU, 2 GB de RAM e 20 GB de disco.

## 1. Servidor
1. Crie a VPS com Ubuntu e instale o Docker: `curl -fsSL https://get.docker.com | sh`.
2. Aponte o domínio (ex.: `lavajatocapua.com.br`) para o IP da VPS (registro A no painel do domínio).

## 2. Aplicação
```bash
git clone https://github.com/Nerdxxx/lava-jato.git ljc && cd ljc
cp .env.example .env
nano .env   # preencha os itens abaixo
```
No `.env` de produção:
- `APP_URL=https://seu-dominio.com.br`
- `APP_SECRET=` gere com `openssl rand -hex 32`
- `POSTGRES_PASSWORD=` senha forte
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` para o primeiro administrador

Suba banco + app (aplica as migrations automaticamente):
```bash
docker compose --profile prod up -d --build
docker compose --profile prod exec app npx tsx scripts/seed.ts   # catálogo inicial + administrador
```

## 3. HTTPS
Use o Caddy como proxy (certificado grátis automático):
```bash
sudo apt install -y caddy
echo 'seu-dominio.com.br {
  reverse_proxy localhost:3000
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Os cookies de sessão só ficam `Secure` em produção, então **sempre** acesse por `https://`.

## 4. Depois de subir
1. Entre com o administrador e **troque a senha** em *Minha conta*.
2. *Configurações → Dados do negócio*: WhatsApp do lava jato, endereço, link do Google Maps, Instagram e chave Pix.
3. *Configurações*: confirme horários, vagas, durações e preços.
4. *Fidelidade*: ative o programa se quiser.
5. *Estoque*: cadastre os produtos e as regras de consumo por serviço.
6. *Funcionários*: crie os acessos da equipe.

## Atualizar a versão
```bash
cd ljc && git pull && docker compose --profile prod up -d --build
```

## Backup (diário, recomendado)
```bash
# banco
docker compose exec -T db pg_dump -U ljc ljc | gzip > backup-$(date +%F).sql.gz
# fotos das OS
docker run --rm -v ljc_ljc_storage:/data -v "$PWD":/out alpine tar czf /out/fotos-$(date +%F).tgz -C /data .
```
Guarde as cópias fora do servidor (Google Drive, outro computador). Agende com `crontab -e`.
