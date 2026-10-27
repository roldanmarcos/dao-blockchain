// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./StudentSBT.sol";

/// @title Token de gobernanza de la UNQ: cada UNQC equivale a un voto.
contract UNQToken is ERC20, Ownable {
    StudentSBT public immutable studentSBT;
    mapping(address => bool) public faucets;

    constructor(address studentSBTAddress)
        ERC20("UNQ Coin", "UNQC")
        Ownable(msg.sender)
    {
        require(studentSBTAddress != address(0), "UNQC: SBT invalido");
        studentSBT = StudentSBT(studentSBTAddress);
    }

    /// @notice Autoriza o revoca una wallet como faucet. Solo la universidad.
    function setFaucet(address faucet, bool autorizado) external onlyOwner {
        require(faucet != address(0), "UNQC: faucet invalido");
        faucets[faucet] = autorizado;
    }

    /// @notice Asigna tokens a un alumno con credencial, por la universidad o un faucet.
    /// @dev cantidad se expresa en UNQC enteros; por ejemplo, 100 acuña 100 UNQC.
    function mint(address alumno, uint256 cantidad) external {
        require(msg.sender == owner() || faucets[msg.sender], "UNQC: no autorizado");
        require(studentSBT.balanceOf(alumno) > 0, "UNQC: requiere credencial estudiantil");
        require(cantidad > 0, "UNQC: cantidad invalida");
        _mint(alumno, cantidad * 1 ether);
    }

    /// @dev Permite acuñar (desde cero) y quemar (hacia cero), pero bloquea transferencias.
    function _update(address from, address to, uint256 value) internal override {
        require(from == address(0) || to == address(0), "UNQC: token intransferible");
        super._update(from, to, value);
    }
}
