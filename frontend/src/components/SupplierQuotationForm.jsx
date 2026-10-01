import { useEffect, useMemo, useState } from 'react';
import { catalogApi } from '../api/catalogApi';
import { quotationApi } from '../api/quotationApi';

function dateTimeInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function SupplierQuotationForm({ purchaseRequest, onSubmitted }) {
  const [offers, setOffers] = useState([]);
  const [prices, setPrices] = useState({});
  const [quantities, setQuantities] = useState({});
  const [currency, setCurrency] = useState('');
  const [deliveryTimeDays, setDeliveryTimeDays] = useState('7');
  const [validUntil, setValidUntil] = useState(
    dateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    catalogApi.getSupplierProducts()
      .then((supplierProducts) => {
        const productIds = new Set(purchaseRequest.items.map((item) => item.product_id));
        const matchingOffers = supplierProducts.filter(
          (offer) => productIds.has(offer.product_id) && offer.is_active
        );
        setOffers(matchingOffers);
        const commonCurrencies = [...new Set(matchingOffers.map((offer) => offer.currency))]
          .filter((option) => purchaseRequest.items.every((item) => matchingOffers.some(
            (offer) => offer.product_id === item.product_id && offer.currency === option
          )));
        const firstCurrency = commonCurrencies[0];
        const firstOffer = matchingOffers.find((offer) => offer.currency === firstCurrency);
        setCurrency(firstCurrency || '');
        if (firstOffer) {
          setDeliveryTimeDays(String(firstOffer.lead_time_days ?? 7));
          setPrices(Object.fromEntries(
            matchingOffers
              .filter((offer) => offer.currency === firstCurrency)
              .map((offer) => [offer.product_id, String(offer.unit_price)])
          ));
        }
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.error?.message || 'Could not load your product prices');
      })
      .finally(() => setIsLoading(false));
  }, [purchaseRequest.items]);

  const currencyOptions = useMemo(() => {
    if (!purchaseRequest.items.length) return [];
    return [...new Set(offers.map((offer) => offer.currency))]
      .filter((option) => purchaseRequest.items.every((item) => offers.some(
        (offer) => offer.product_id === item.product_id && offer.currency === option
      )));
  }, [offers, purchaseRequest.items]);

  function offerFor(productId, selectedCurrency) {
    return offers.find(
      (offer) => offer.product_id === productId && offer.currency === selectedCurrency
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const items = purchaseRequest.items.map((item) => ({
      purchaseRequestItemId: item.id,
      quantity: Number(quantities[item.id] ?? item.quantity),
      unitPrice: Number(prices[item.product_id]),
    }));
    if (!currency || items.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      setError('Provide a valid price and common currency for every requested product.');
      return;
    }
    setIsSubmitting(true);
    try {
      const quotation = await quotationApi.submit(purchaseRequest.id, {
        currency,
        deliveryTimeDays: Number(deliveryTimeDays),
        validUntil: new Date(validUntil).toISOString(),
        notes: notes || null,
        items,
      });
      onSubmitted(quotation);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not submit quotation');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="request-detail-section quotation-form-section">
      <h2>Submit quotation</h2>
      <p className="muted">Quote at least the requested quantity for every line. Prices must use a currency available for all your active offers.</p>
      {isLoading && <p className="muted">Loading your offers…</p>}
      {!isLoading && purchaseRequest.items.some((item) => !offers.some((offer) => (
        offer.product_id === item.product_id && offer.is_active
         && offer.available_quantity >= item.quantity
      ))) && (
       <p className="form-error">You need enough active inventory for every requested product before you can quote.</p>
      )}
      {!isLoading && (
        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>Currency
              <select value={currency} onChange={(event) => {
                setCurrency(event.target.value);
                const nextPrices = {};
                for (const item of purchaseRequest.items) {
                  const offer = offerFor(item.product_id, event.target.value);
                  if (offer) nextPrices[item.product_id] = String(offer.unit_price);
                }
                setPrices(nextPrices);
              }} required>
                <option value="" disabled>Select currency</option>
                {currencyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>Delivery time (days)
              <input type="number" min="0" max="3650" value={deliveryTimeDays} onChange={(event) => setDeliveryTimeDays(event.target.value)} required />
            </label>
          </div>
          {purchaseRequest.items.map((item) => {
            const offer = offerFor(item.product_id, currency);
            return (
              <label key={item.id}>
                {item.product_name} · requested quantity {item.quantity}
                <input
                  type="number"
                  min={item.quantity}
                  max={offer?.available_quantity ?? item.quantity}
                  step="1"
                  value={quantities[item.id] ?? String(item.quantity)}
                  onChange={(event) => setQuantities((current) => ({
                    ...current,
                    [item.id]: event.target.value,
                  }))}
                  required
                />
                <input
                  type="number"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={prices[item.product_id] ?? (offer ? String(offer.unit_price) : '')}
                  onChange={(event) => setPrices((current) => ({
                    ...current,
                    [item.product_id]: event.target.value,
                  }))}
                  required
                />
                <small>{offer ? `${offer.available_quantity} available` : `No active ${currency} offer`}</small>
              </label>
            );
          })}
          <label>Valid until
            <input
              type="datetime-local"
              value={validUntil}
              min={dateTimeInputValue(new Date())}
              onChange={(event) => setValidUntil(event.target.value)}
              required
            />
          </label>
          <label>Notes<textarea rows="3" maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button
            className="primary-button"
            disabled={isSubmitting || !currencyOptions.includes(currency) || purchaseRequest.items.some((item) => !offers.some(
              (offerItem) => offerItem.product_id === item.product_id && offerItem.is_active
                && offerItem.currency === currency
                && offerItem.available_quantity >= Number(quantities[item.id] ?? item.quantity)
            ))}
          >
            {isSubmitting ? 'Submitting…' : 'Submit quotation'}
          </button>
        </form>
      )}
    </section>
  );
}

export default SupplierQuotationForm;
