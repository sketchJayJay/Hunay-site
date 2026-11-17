export function priceForQuantity(product, quantity, regularPrice = product.price) {
    let minimum = 0, price = regularPrice;
    for (const tier of product.quantityPrices || []) {
        if (quantity >= tier.minQty && tier.minQty > minimum) {
            minimum = tier.minQty;
            price = Math.min(regularPrice, tier.price);
        }
    }
    return price;
}
export function quantitiesByProduct(items) {
    const totals = new Map();
    for (const i of items)
        totals.set(i.productId, (totals.get(i.productId) || 0) + i.qty);
    return totals;
}
export function validateQuantityPrices(value, regularPrice) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value) || value.length > 10)
        throw new Error('Cadastre até 10 faixas de preço por quantidade.');
    const tiers = value.map((raw) => ({ minQty: Number(raw?.minQty), price: Number(raw?.price) })).sort((a, b) => a.minQty - b.minQty);
    let previousQty = 1, previousPrice = regularPrice;
    for (const tier of tiers) {
        if (!Number.isSafeInteger(tier.minQty) || tier.minQty < 2 || tier.minQty > 10000 || tier.minQty === previousQty)
            throw new Error('Cada faixa precisa de uma quantidade mínima inteira e diferente, entre 2 e 10.000.');
        if (!Number.isSafeInteger(tier.price) || tier.price < 1 || tier.price >= previousPrice)
            throw new Error('O preço por unidade deve ser positivo e menor que o preço da faixa anterior.');
        previousQty = tier.minQty;
        previousPrice = tier.price;
    }
    return tiers;
}
export function discountFromInput(value, type, subtotal) {
    const number = Number(value || 0);
    return Math.round(type === 'percent' ? subtotal * number / 100 : number * 100);
}
