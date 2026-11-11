/**
 * Base connector interface for pluggable ecommerce, logistics, and communication sources.
 */
export class BaseConnector {
  constructor(name) {
    this.name = name;
  }

  async fetch(orderId) {
    throw new Error(`fetch() method must be implemented by connector: ${this.name}`);
  }
}

export default BaseConnector;

