// Usage
const result = cart.create(
  {
    lines: [
      {
        merchandiseId: '123',
        quantity: 1,
      },
    ],
    discountCodes: ['FREE_SHIPPING'],
  },
  // Optional parameters
  {
    cartId: '123', // override the cart id
    country: 'US', // override the country code to 'US'
    language: 'EN', // override the language code to 'EN'
  },
);

// Output of result:
// {
//   cart: {
//     id: 'c1-123',
//     totalQuantity: 1,
//     discountCodes: [{ code: 'FREE_SHIPPING'}]
//   },
//   errors: []
// }
