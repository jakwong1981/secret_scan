IMAGE_NAME ?= secretkeypreview
ROOT       := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
VERSION    ?= $(shell node -p "require('$(ROOT)/package.json').version")
REGISTRY   ?=
NODE_IMAGE ?= node:22.14.0-bookworm-slim

.PHONY: help install setup-tls dev build test lint typecheck docker docker-push tar deploy-local deploy-remote logs status stop clean

## help: list targets
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## pnpm install
	pnpm install

setup-tls: ## generate + trust local HTTPS certificate (macOS)
	./scripts/setup-tls.sh

dev: ## run backend + frontend in dev mode (HTTPS)
	pnpm dev

build: ## build web + server
	pnpm build

test: ## run all unit + integration tests
	pnpm -r test

lint: ## eslint across workspace
	pnpm -r lint

typecheck: ## tsc --noEmit across workspace
	pnpm -r typecheck

docker: ## build the image locally (host arch)
	VERSION=$(VERSION) NODE_IMAGE=$(NODE_IMAGE) IMAGE_NAME=$(IMAGE_NAME) REGISTRY=$(REGISTRY) scripts/build-docker.sh

docker-push: ## build multi-arch and push to $$REGISTRY
	PLATFORMS=$(PLATFORMS) PUSH=true VERSION=$(VERSION) NODE_IMAGE=$(NODE_IMAGE) IMAGE_NAME=$(IMAGE_NAME) REGISTRY=$(REGISTRY) scripts/build-docker.sh

tar: ## export image archive for air-gapped installs
	VERSION=$(VERSION) NODE_IMAGE=$(NODE_IMAGE) IMAGE_NAME=$(IMAGE_NAME) TAR_OUT=build/$(IMAGE_NAME)-$(VERSION).tar scripts/build-docker.sh

deploy-local: ## build + run via docker compose (loopback only)
	./scripts/deploy.sh local

deploy-remote: ## ship image + compose to $$REMOTE_HOST
	REMOTE_HOST=$(REMOTE_HOST) SKP_IMAGE_TAG=$(VERSION) ./scripts/deploy.sh remote

logs:   ## follow logs
	./scripts/deploy.sh logs

status: ## container status
	./scripts/deploy.sh status

stop: ## stop stack (data volume retained)
	./scripts/deploy.sh stop

clean: ## remove build + runtime artifacts
	rm -rf packages/*/dist packages/*/node_modules node_modules build data
