exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ mensaje: "¡Hola desde una función sin servidor!" }),
  };
};   
