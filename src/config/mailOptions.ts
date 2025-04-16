export const mailOptions = (userEmail: string, code: any) => {
  return {
    from: {
      name: "E-Renter Services",
      address: process.env.EMAIL || "",
    },
    to: userEmail,
    subject: "Your One Time Password code 🔒",
    html: `<p> Dear User, <br /> <br /> One time password (OTP) code: <b>${code}</b>. Use this to verify your gmail. For your security, 
        please don't share this code with anyone else. If you did not make this request, ignore this message. <br /> <br /> Sincerely, <br /> E-Renter </p>`,
  };
};
