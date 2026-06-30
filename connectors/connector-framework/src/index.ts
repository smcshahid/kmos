/**
 * @kmos/connector-framework — the Connector Framework (WP-17).
 *
 * Public surface: the Connector contract + value objects, the ConnectorHost
 * (the framework), and the WebPageConnector reference connector. External
 * Connectors translate foreign protocols into canonical objects + events and
 * are governed, first-class canonical identities (KMOS-0180 §22, KMOS-0170).
 */
export * from './domain/connector-types.js';
export * from './application/connector-host.js';
export * from './connectors/web-page-connector.js';
