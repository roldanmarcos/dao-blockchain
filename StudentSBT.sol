// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Credencial estudiantil intransferible de la UNQ
contract StudentSBT is ERC721, Ownable {
    uint256 private _nextTokenId = 1;

    constructor() ERC721("Credencial Estudiantil UNQ", "UNQ-SBT") Ownable(msg.sender) {}

    /// @notice Emite un carnet a un alumno validado. Solo puede hacerlo la universidad.
    function mint(address alumno) external onlyOwner {
        require(alumno != address(0), "SBT: alumno invalido");
        _safeMint(alumno, _nextTokenId++);
    }

    /// @dev Bloquea transferencias entre direcciones; permite mint y quema.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "SBT: Credencial intransferible");
        return super._update(to, tokenId, auth);
    }
}
