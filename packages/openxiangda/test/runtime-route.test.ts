import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppRouteManifestV3 } from 'openxiangda-contracts/browser';
import {
  resolveRuntimeManifestNavigation,
} from '../src/browser/runtime';
import {
  standardRouteManifestDeviceForViewport,
  type StandardRouteManifestDevice,
} from '../src/browser/route-manifest';

const manifest: AppRouteManifestV3 = {
  schemaVersion: 'openxiangda.application-route-manifest/v3',
  appCode: 'runtime-route-test',
  devicePolicy: {
    kind: 'viewport-family',
    mobileMaxWidthPx: 900,
    desktopMinWidthPx: 901,
  },
  rootEntry: {
    code: 'application-home',
    desktop: '/home',
    mobile: '/m/home',
  },
  authentication: {
    desktop: { routeCode: 'application-login', path: '/login' },
    mobile: { routeCode: 'application-login-mobile', path: '/m/login' },
  },
  routes: [],
  digest: 'a'.repeat(64),
};

const authentication = [
  {
    surface: {
      device: 'desktop',
      routeCode: 'application-login',
      path: '/login',
      defaultRouteCode: 'application-home',
    },
    component: () => null,
  },
  {
    surface: {
      device: 'mobile',
      routeCode: 'application-login-mobile',
      path: '/m/login',
      defaultRouteCode: 'application-home-mobile',
    },
    component: () => null,
  },
] as const;

test('selects the manifest login pair for an unauthenticated neutral root', () => {
  const cases: readonly [number, StandardRouteManifestDevice, string][] = [
    [390, 'mobile', '/m/login'],
    [900, 'mobile', '/m/login'],
    [901, 'desktop', '/login'],
    [1440, 'desktop', '/login'],
  ];
  for (const [width, expectedDevice, expectedPath] of cases) {
    const viewportDevice = standardRouteManifestDeviceForViewport(
      manifest.devicePolicy,
      width,
    );
    const selection = resolveRuntimeManifestNavigation({
      authentication,
      manifest,
      pathname: '/',
      viewportDevice,
    });
    assert.equal(selection.requestedDevice, expectedDevice);
    assert.equal(selection.loginContribution, undefined);
    assert.equal(selection.deviceLoginContribution?.surface.path, expectedPath);
  }
});

test('keeps an explicit mobile authentication surface mobile at desktop width', () => {
  const selection = resolveRuntimeManifestNavigation({
    authentication,
    manifest,
    pathname: '/m/login',
    viewportDevice: 'desktop',
  });
  assert.equal(selection.requestedDevice, 'mobile');
  assert.equal(selection.loginContribution?.surface.path, '/m/login');
  assert.equal(selection.deviceLoginContribution?.surface.path, '/m/login');
});
