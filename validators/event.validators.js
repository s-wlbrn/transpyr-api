const totalTicketCapacities = (tickets) => {
  return tickets.reduce((acc, ticket) => {
    return acc + ticket.capacity;
  }, 0);
};

const allTicketsLimited = (tickets) => {
  return tickets.every((ticket) => {
    return ticket.capacity > 0;
  });
};

const uniqueTicketNames = function (v) {
  const ticketMap = {};
  let unique = true;
  v.forEach((ticket) => {
    const formattedName = ticket.tierName.trim().toLowerCase();
    if (ticketMap[formattedName]) {
      unique = false;
      return;
    }
    ticketMap[formattedName] = true;
  });
  return unique;
};

const ticketCapacitiesWithinTotal = function (v) {
  const ticketCapacities = totalTicketCapacities(v);
  return this.totalCapacity === 0 || ticketCapacities <= this.totalCapacity;
};

const noSpareTickets = function (v) {
  const ticketsLimited = allTicketsLimited(v);
  const ticketCapacities = totalTicketCapacities(v);
  return (
    this.totalCapacity === 0 ||
    !ticketsLimited ||
    !(ticketCapacities < this.totalCapacity)
  );
};

module.exports = {
  uniqueTicketNames,
  ticketCapacitiesWithinTotal,
  noSpareTickets,
};
